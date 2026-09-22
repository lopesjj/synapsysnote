import { nanoid } from "nanoid";
import { attr, findDescendants, parseMarkup, textContent, type ParsedElement } from "./dom";
import { mimeFromName, parseDataUrl, sanitizeFileName } from "./binary";
import {
  firstHeadingText,
  guessNameFromUrl,
  htmlToBlocks,
  spansPlainText,
  type HtmlMediaResolution,
} from "./html-blocks";
import {
  assetUrl,
  type ImportedAsset,
  type ImportedNote,
  type ImportSourceKind,
  type ImportWarningCode,
} from "./types";

export interface HtmlImportOptions {
  sourceFileName: string;
  source?: ImportSourceKind;
  resolveRelative?: (path: string) => { bytes: Uint8Array; name: string; mimeType: string } | null;
}

export function looksLikeGoogleDocsExport(html: string): boolean {
  const head = html.slice(0, 20000);
  return (
    /lst-kix_/.test(head) ||
    /<title>[^<]*- Google Docs<\/title>/i.test(head) ||
    /docs-internal-guid/i.test(head) ||
    /class="doc-content"/i.test(head)
  );
}

function documentTitle(root: ParsedElement, fileName: string): string {
  const titleElement = findDescendants(root, "title")[0];
  const raw = titleElement ? textContent(titleElement).trim() : "";
  const cleaned = raw.replace(/\s*[-–—]\s*Google\s*(Docs|Documentos)\s*$/i, "").trim();
  if (cleaned) return cleaned;
  return fileName.replace(/\.(x?html?|htm)$/i, "").trim();
}

export function parseHtmlDocument(html: string, options: HtmlImportOptions): ImportedNote {
  const root = parseMarkup(html, { xml: false });
  const warnings = new Set<ImportWarningCode>();
  const assets: ImportedAsset[] = [];
  const assetByKey = new Map<string, ImportedAsset>();

  const resolveMedia = (element: ParsedElement): HtmlMediaResolution | null => {
    if (element.name !== "img") return null;
    const src = attr(element, "src") ?? attr(element, "data-src");
    if (!src) return null;
    const alt = attr(element, "alt") ?? "";

    if (src.startsWith("data:")) {
      const parsed = parseDataUrl(src);
      if (!parsed || !parsed.bytes.length) {
        warnings.add("missing_asset");
        return null;
      }
      const cached = assetByKey.get(src);
      const asset =
        cached ??
        ({
          id: `html_${nanoid(10)}`,
          name: sanitizeFileName(alt || `imagem-${assets.length + 1}.${parsed.mimeType.split("/")[1] ?? "png"}`),
          mimeType: parsed.mimeType,
          bytes: parsed.bytes,
        } satisfies ImportedAsset);
      if (!cached) {
        assets.push(asset);
        assetByKey.set(src, asset);
      }
      return {
        url: assetUrl(asset.id),
        name: asset.name,
        mimeType: asset.mimeType,
        sizeBytes: asset.bytes.length,
        kind: "image",
      };
    }

    if (/^https?:/i.test(src) || src.startsWith("//")) {
      warnings.add("remote_asset");
      return {
        url: src.startsWith("//") ? `https:${src}` : src,
        name: sanitizeFileName(alt || guessNameFromUrl(src, "imagem")),
        kind: "image",
      };
    }

    if (/^[a-z][a-z0-9+.-]*:/i.test(src)) {
      warnings.add("missing_asset");
      return null;
    }

    const decoded = decodeURIComponent(src.split("?")[0].split("#")[0]);
    const cached = assetByKey.get(decoded);
    const resolved = cached ? null : options.resolveRelative?.(decoded);
    if (!cached && !resolved) {
      warnings.add("missing_asset");
      return null;
    }
    const asset =
      cached ??
      ({
        id: `html_${nanoid(10)}`,
        name: sanitizeFileName(resolved!.name),
        mimeType: resolved!.mimeType || mimeFromName(resolved!.name, "image/png"),
        bytes: resolved!.bytes,
      } satisfies ImportedAsset);
    if (!cached) {
      assets.push(asset);
      assetByKey.set(decoded, asset);
    }
    return {
      url: assetUrl(asset.id),
      name: asset.name,
      mimeType: asset.mimeType,
      sizeBytes: asset.bytes.length,
      kind: "image",
    };
  };

  const blocks = htmlToBlocks(root, {
    resolveMedia,
    onWarning: (code) => warnings.add(code),
  });

  const source: ImportSourceKind = options.source ?? (looksLikeGoogleDocsExport(html) ? "google-docs" : "html");
  const fallbackTitle = blocks.map((block) => spansPlainText(block.richText).trim()).find(Boolean);

  return {
    sourceId: `html_${nanoid(10)}`,
    title:
      documentTitle(root, options.sourceFileName) ||
      firstHeadingText(blocks) ||
      fallbackTitle?.slice(0, 120) ||
      "Documento",
    blocks,
    tags: [],
    assets,
    source,
    sourceFileName: options.sourceFileName,
    warnings: [...warnings],
  };
}
