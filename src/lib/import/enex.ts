import { nanoid } from "nanoid";
import {
  attr,
  childElements,
  childText,
  findDescendants,
  isElement,
  parseMarkup,
  textContent,
  type ParsedElement,
} from "./dom";
import { base64ToBytes, extensionForMime, sanitizeFileName } from "./binary";
import { htmlToBlocks, spansPlainText, type HtmlMediaResolution } from "./html-blocks";
import { md5Hex } from "./md5";
import { assetUrl, ImportError, type ImportedAsset, type ImportedNote, type ImportWarningCode } from "./types";

interface EnexResource {
  asset: ImportedAsset;
  hash: string;
  fileName: string;
  sourceUrl: string;
  width?: number;
  height?: number;
  used: boolean;
}

function parseEvernoteDate(raw: string | undefined | null): number | undefined {
  if (!raw) return undefined;
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/.exec(raw.trim());
  if (!match) {
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  const [, year, month, day, hour, minute, second] = match;
  return Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  );
}

function readResource(resource: ParsedElement, noteIndex: number, index: number): EnexResource | null {
  const dataElement = childElements(resource, "data")[0];
  if (!dataElement) return null;
  const encoding = (attr(dataElement, "encoding") ?? "base64").toLowerCase();
  if (encoding !== "base64") return null;

  const bytes = base64ToBytes(textContent(dataElement));
  if (!bytes.length) return null;

  const mimeType = childText(resource, "mime").trim() || "application/octet-stream";
  const attributes = childElements(resource, "resource-attributes")[0];
  const fileNameRaw = attributes ? childText(attributes, "file-name").trim() : "";
  const sourceUrl = attributes ? childText(attributes, "source-url").trim() : "";
  const width = Number.parseInt(childText(resource, "width"), 10);
  const height = Number.parseInt(childText(resource, "height"), 10);
  const fileName = sanitizeFileName(
    fileNameRaw || `evernote-${noteIndex + 1}-${index + 1}.${extensionForMime(mimeType)}`
  );

  return {
    asset: {
      id: `enex_${nanoid(10)}`,
      name: fileName,
      mimeType,
      bytes,
    },
    hash: md5Hex(bytes),
    fileName: fileNameRaw,
    sourceUrl,
    ...(Number.isFinite(width) && width > 0 ? { width } : {}),
    ...(Number.isFinite(height) && height > 0 ? { height } : {}),
    used: false,
  };
}

function markCodeBlocks(root: ParsedElement) {
  const stack: ParsedElement[] = [root];
  while (stack.length) {
    const current = stack.pop();
    if (!current) continue;
    for (const child of current.children) {
      if (!isElement(child)) continue;
      const style = child.attrs.style ?? "";
      if (child.name === "div" && /--en-codeblock\s*:\s*true/i.test(style)) {
        child.name = "pre";
        continue;
      }
      stack.push(child);
    }
  }
}

function resolveEnMedia(
  element: ParsedElement,
  resources: EnexResource[],
  warn: (code: ImportWarningCode) => void
): HtmlMediaResolution | null {
  const hash = (attr(element, "hash") ?? "").toLowerCase();
  const type = (attr(element, "type") ?? "").toLowerCase();

  let match = hash ? resources.find((resource) => resource.hash === hash) : undefined;
  if (!match) match = resources.find((resource) => !resource.used && (!type || resource.asset.mimeType === type));
  if (!match) match = resources.find((resource) => !resource.used);
  if (!match) {
    warn("missing_asset");
    return null;
  }

  match.used = true;
  const width = Number.parseInt(attr(element, "width") ?? "", 10);
  const height = Number.parseInt(attr(element, "height") ?? "", 10);

  return {
    url: assetUrl(match.asset.id),
    name: match.asset.name,
    mimeType: match.asset.mimeType,
    sizeBytes: match.asset.bytes.length,
    ...(Number.isFinite(width) && width > 0
      ? { width }
      : match.width
        ? { width: match.width }
        : {}),
    ...(Number.isFinite(height) && height > 0
      ? { height }
      : match.height
        ? { height: match.height }
        : {}),
  };
}

export function enexNotebookName(sourceFileName: string): string {
  return sourceFileName.replace(/\.enex$/i, "").trim();
}

function noteContainerPath(
  note: ParsedElement,
  containerPath: string[] | undefined,
  sourceFileName: string
): string[] {
  if (containerPath) return containerPath.filter(Boolean);
  const declared = childText(note, "notebook").trim();
  if (declared) return [declared];
  const fromFile = enexNotebookName(sourceFileName);
  return fromFile ? [fromFile] : [];
}

export function parseEnex(
  xml: string,
  sourceFileName: string,
  containerPath?: string[]
): ImportedNote[] {
  const root = parseMarkup(xml, { xml: true });
  const notes = findDescendants(root, "note");
  if (!notes.length) {
    throw new ImportError("empty_file", "Nenhuma nota encontrada no arquivo do Evernote.");
  }

  return notes.map((note, noteIndex) => {
    const warnings = new Set<ImportWarningCode>();
    const warn = (code: ImportWarningCode) => warnings.add(code);

    const resources = childElements(note, "resource")
      .map((resource, index) => readResource(resource, noteIndex, index))
      .filter((resource): resource is EnexResource => Boolean(resource));

    const enml = childText(note, "content");
    const contentRoot = parseMarkup(enml, { xml: false });
    markCodeBlocks(contentRoot);

    const blocks = htmlToBlocks(contentRoot, {
      onWarning: warn,
      resolveMedia: (element) =>
        element.name === "en-media" ? resolveEnMedia(element, resources, warn) : null,
    });

    for (const resource of resources) {
      if (resource.used) continue;
      const isImage = resource.asset.mimeType.startsWith("image/");
      blocks.push({
        id: `blk_${nanoid(8)}`,
        type: isImage ? "image" : "file",
        media: {
          url: assetUrl(resource.asset.id),
          name: resource.asset.name,
          mimeType: resource.asset.mimeType,
          sizeBytes: resource.asset.bytes.length,
          pending: false,
        },
      });
      resource.used = true;
    }

    const title = childText(note, "title").trim();
    const tags = childElements(note, "tag")
      .map((tag) => textContent(tag).trim())
      .filter(Boolean);

    const fallbackTitle = blocks
      .map((block) => spansPlainText(block.richText).trim())
      .find((text) => text.length > 0);

    const notebookPath = noteContainerPath(note, containerPath, sourceFileName);

    return {
      sourceId: `enex_${nanoid(10)}`,
      title: title || fallbackTitle?.slice(0, 120) || enexNotebookName(sourceFileName),
      blocks,
      tags,
      assets: resources.map((resource) => resource.asset),
      source: "evernote",
      sourceFileName,
      ...(notebookPath.length ? { containerPath: notebookPath } : {}),
      warnings: [...warnings],
      createdAt: parseEvernoteDate(childText(note, "created").trim()),
      updatedAt: parseEvernoteDate(childText(note, "updated").trim()),
    } satisfies ImportedNote;
  });
}

export function parseEnmlNote(options: {
  enml: string;
  title: string;
  tags?: string[];
  sourceFileName?: string;
}): ImportedNote {
  const warnings = new Set<ImportWarningCode>();
  const warn = (code: ImportWarningCode) => warnings.add(code);

  const contentRoot = parseMarkup(options.enml, { xml: false });
  markCodeBlocks(contentRoot);

  const blocks = htmlToBlocks(contentRoot, {
    onWarning: warn,
  });

  const fallbackTitle = blocks
    .map((block) => spansPlainText(block.richText).trim())
    .find((text) => text.length > 0);

  return {
    sourceId: `evernote_${nanoid(10)}`,
    title: options.title || fallbackTitle?.slice(0, 120) || "Nota do Evernote",
    blocks,
    tags: options.tags || [],
    assets: [],
    source: "evernote",
    sourceFileName: options.sourceFileName || "Evernote",
    warnings: [...warnings],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

