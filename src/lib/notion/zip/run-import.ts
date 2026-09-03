import JSZip from "jszip";
import type { AppBlock, RichTextSpan } from "@/types/models";
import type { DataAdapter, NotebookDraft, PageDraft } from "@/lib/data/adapter";
import {
  commonPrefixDepth,
  isCsv,
  isImage,
  isMarkdown,
  isMedia,
  mimeTypeOf,
  readArchive,
  stripNotionId,
} from "./archive";
import { csvToBlocks } from "./csv";
import { parseNotionMarkdown } from "./markdown";
import type { ImportPlanSummary, ImportProgress, ZipEntry } from "./types";

/**
 * Client-side Notion `.zip` importer.
 *
 * Runs entirely in the browser: JSZip unpacks the archive, the Markdown and CSV
 * converters produce `AppBlock[]`, media is uploaded to Cloud Storage through
 * the adapter, and the whole hierarchy is written in batches so a failure never
 * leaves a half-imported notebook behind.
 *
 * The order matters. Media has to be uploaded *before* the documents are
 * written, because each image block needs its permanent download URL; and page
 * ids are only known after the commit, so internal links are resolved in a
 * second pass once the key → id mapping comes back.
 */

export interface ImportPlan {
  /** Top-level folders become notebooks. */
  notebooks: NotebookDraft[];
  pages: PageDraft[];
  media: { entry: ZipEntry; key: string }[];
  summary: ImportPlanSummary;
  /** Notion id → page key, for turning relative links into mentions. */
  pageByNotionId: Map<string, string>;
  /** Relative archive path → page key, for links that carry no id. */
  pageByPath: Map<string, string>;
  /** Page key → media paths its blocks still reference relatively. */
  pendingMedia: Map<string, string[]>;
  /** Page key → relative document links awaiting resolution. */
  pendingLinks: Map<string, string[]>;
}

/** Everything the plan needs from a single `.md` or `.csv` entry. */
interface DocumentEntry {
  entry: ZipEntry;
  key: string;
  /** Directory segments (relative to the export root) containing this file. */
  parentSegments: string[];
  title: string;
  notionId: string | null;
  kind: "page" | "database";
}

const DEFAULT_NOTEBOOK_KEY = "nb:import";

/**
 * The folder holding a page's children is named exactly like its file, minus
 * the extension — `Projetos abc…123.md` pairs with `Projetos abc…123/`.
 */
function folderNameOf(entry: ZipEntry): string {
  return (entry.segments.at(-1) ?? "").replace(/\.(md|csv)$/i, "");
}

export async function buildImportPlan(file: Blob): Promise<ImportPlan> {
  // Hand JSZip an ArrayBuffer rather than the Blob: it is the one input type
  // every JSZip build accepts, browser or not.
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const entries = await readArchive(zip);

  const documents: DocumentEntry[] = [];
  const media: { entry: ZipEntry; key: string }[] = [];
  const skipped: string[] = [];

  for (const entry of entries) {
    if (isMarkdown(entry.path) || isCsv(entry.path)) {
      const { title, notionId } = stripNotionId(entry.segments.at(-1) ?? "");
      documents.push({
        entry,
        key: `pg:${entry.relativePath}`,
        parentSegments: entry.segments.slice(0, -1),
        title,
        notionId,
        kind: isCsv(entry.path) ? "database" : "page",
      });
    } else if (isMedia(entry.path)) {
      media.push({ entry, key: entry.relativePath });
    } else {
      skipped.push(entry.relativePath);
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Hierarchy                                                             */
  /* ---------------------------------------------------------------------- */

  /**
   * A folder is a page's children when a document of the same name sits beside
   * it. Keyed by the folder's own segments so lookups are exact.
   */
  const documentByFolder = new Map<string, DocumentEntry>();
  for (const document of documents) {
    const folder = [...document.parentSegments, folderNameOf(document.entry)].join("/");
    documentByFolder.set(folder, document);
  }

  const notebooks = new Map<string, NotebookDraft>();
  const notebookPageCounts = new Map<string, number>();

  const notebookKeyFor = (segments: string[]): string => {
    // The first level of the export is the notebook; deeper levels are pages.
    if (!segments.length) return DEFAULT_NOTEBOOK_KEY;
    const root = segments[0];
    // A folder that mirrors a document is that page's children, not a notebook.
    if (documentByFolder.has(root)) return notebookKeyFor([]);
    const key = `nb:${root}`;
    if (!notebooks.has(key)) {
      notebooks.set(key, {
        key,
        name: stripNotionId(root).title,
        emoji: "📓",
        order: notebooks.size,
      });
    }
    return key;
  };

  const parentKeyFor = (document: DocumentEntry): string | null => {
    // Walk up from the file's own folder to the nearest folder that mirrors a
    // document. That document is the parent page.
    for (let depth = document.parentSegments.length; depth > 0; depth -= 1) {
      const folder = document.parentSegments.slice(0, depth).join("/");
      const owner = documentByFolder.get(folder);
      if (owner && owner.key !== document.key) return owner.key;
    }
    return null;
  };

  const pages: PageDraft[] = [];
  const pageByNotionId = new Map<string, string>();
  const pageByPath = new Map<string, string>();
  const pendingMedia = new Map<string, string[]>();
  const pendingLinks = new Map<string, string[]>();

  for (const document of documents) {
    const source = await document.entry.file.async("string");

    let blocks: AppBlock[];
    let title = document.title;
    let mediaPaths: string[] = [];
    let documentLinks: string[] = [];

    if (document.kind === "database") {
      blocks = csvToBlocks(source).blocks;
    } else {
      const parsed = parseNotionMarkdown(source);
      blocks = parsed.blocks;
      title = parsed.title || document.title;
      mediaPaths = parsed.mediaPaths;
      documentLinks = parsed.documentLinks;
    }

    const parentKey = parentKeyFor(document);
    const draft: PageDraft = {
      key: document.key,
      // Sub-pages inherit their ancestor's notebook via `parentKey`; only roots
      // need one assigned.
      notebookKey: parentKey ? null : notebookKeyFor(document.parentSegments),
      parentKey,
      title,
      icon: document.kind === "database" ? "🗂️" : "📄",
      blocks,
      tags: document.kind === "database" ? ["base-de-dados"] : [],
      order: pages.length,
      importSource: "notion-zip",
    };

    pages.push(draft);
    pageByPath.set(document.entry.relativePath, document.key);
    if (document.notionId) pageByNotionId.set(document.notionId, document.key);
    if (mediaPaths.length) pendingMedia.set(document.key, mediaPaths);
    if (documentLinks.length) pendingLinks.set(document.key, documentLinks);

    if (draft.notebookKey) {
      notebookPageCounts.set(
        draft.notebookKey,
        (notebookPageCounts.get(draft.notebookKey) ?? 0) + 1
      );
    }
  }

  // Roots that landed outside any folder need somewhere to live.
  if (pages.some((page) => page.notebookKey === DEFAULT_NOTEBOOK_KEY)) {
    notebooks.set(DEFAULT_NOTEBOOK_KEY, {
      key: DEFAULT_NOTEBOOK_KEY,
      name: "Importado do Notion",
      emoji: "📥",
      order: notebooks.size,
    });
  }

  // Only media actually referenced by a document is worth uploading; Notion
  // exports occasionally carry orphans.
  const referenced = new Set<string>();
  for (const paths of pendingMedia.values()) {
    for (const path of paths) referenced.add(path);
  }

  const notebookList = [...notebooks.values()];
  return {
    notebooks: notebookList,
    pages,
    media: media.filter(({ key }) => isReferenced(key, referenced)),
    pageByNotionId,
    pageByPath,
    pendingMedia,
    pendingLinks,
    summary: {
      notebooks: notebookList.map((notebook) => ({
        name: notebook.name,
        pages: notebookPageCounts.get(notebook.key) ?? 0,
      })),
      pageCount: pages.filter((page) => page.icon !== "🗂️").length,
      databaseCount: pages.filter((page) => page.icon === "🗂️").length,
      mediaCount: media.filter(({ key }) => isReferenced(key, referenced)).length,
      skipped,
    },
  };
}

/**
 * Markdown links are relative to the file that contains them, so a reference
 * can be a bare filename, a partial path or a percent-encoded variant. Match on
 * the tail rather than requiring an exact path.
 */
function isReferenced(mediaKey: string, referenced: Set<string>): boolean {
  if (referenced.has(mediaKey)) return true;
  const name = mediaKey.split("/").pop() ?? mediaKey;
  for (const candidate of referenced) {
    if (candidate.endsWith(mediaKey) || mediaKey.endsWith(candidate)) return true;
    if ((candidate.split("/").pop() ?? candidate) === name) return true;
  }
  return false;
}

export interface RunImportOptions {
  adapter: DataAdapter;
  plan: ImportPlan;
  /** Uploads media to Storage; off keeps the notes but drops the images. */
  uploadMedia: boolean;
  /** Turns relative Notion links into internal page links. */
  resolveLinks: boolean;
  onProgress: (progress: Partial<ImportProgress>) => void;
  signal?: { aborted: boolean };
}

export interface ImportResult {
  notebookIds: string[];
  pageIds: string[];
  /** Id of the first imported root page, for the "open it" action. */
  firstPageId: string | null;
  warnings: string[];
}

export async function runZipImport({
  adapter,
  plan,
  uploadMedia,
  resolveLinks,
  onProgress,
  signal,
}: RunImportOptions): Promise<ImportResult> {
  const warnings: string[] = [];

  /* ------------------------------------------------------------------ media */

  const urlByPath = new Map<string, string>();
  if (uploadMedia && plan.media.length) {
    onProgress({
      stage: "uploading",
      step: `Enviando ${plan.media.length} arquivo(s) de mídia…`,
      mediaTotal: plan.media.length,
      mediaUploaded: 0,
    });

    let uploaded = 0;
    for (const { entry, key } of plan.media) {
      if (signal?.aborted) throw new DOMException("Importação cancelada", "AbortError");
      try {
        const blob = await entry.file.async("blob");
        const asset = await adapter.uploadImportAsset({
          fileName: entry.segments.at(-1) ?? key,
          blob,
          contentType: mimeTypeOf(key),
        });
        urlByPath.set(key, asset.url);
      } catch {
        // A rejected upload (quota, size limit, offline) must not stop the run;
        // the block keeps its caption and the user is told which file failed.
        warnings.push(`Não foi possível enviar ${key}`);
      }
      uploaded += 1;
      onProgress({ mediaUploaded: uploaded, step: `Mídia ${uploaded}/${plan.media.length}` });
    }
  }

  /* ------------------------------------------------------------ media links */

  const pages = plan.pages.map((page) => {
    const references = plan.pendingMedia.get(page.key);
    if (!references?.length) return page;
    return { ...page, blocks: rewriteMedia(page.blocks, urlByPath) };
  });

  /* ----------------------------------------------------------------- commit */

  if (signal?.aborted) throw new DOMException("Importação cancelada", "AbortError");
  onProgress({
    stage: "writing",
    step: `Gravando ${pages.length} nota(s) em ${plan.notebooks.length} caderno(s)…`,
    notebooks: plan.notebooks.length,
    pages: pages.length,
  });

  const committed = await adapter.commitImportedTree({ notebooks: plan.notebooks, pages });

  /* ------------------------------------------------------------ page links */

  if (resolveLinks) {
    const rewrites = collectLinkRewrites(plan, committed.pageIds);
    if (rewrites.size) {
      onProgress({ step: `Reconectando ${rewrites.size} link(s) entre páginas…` });
      for (const [key, hrefToId] of rewrites) {
        const pageId = committed.pageIds[key];
        const source = pages.find((page) => page.key === key);
        if (!pageId || !source) continue;
        try {
          await adapter.updatePage(pageId, {
            blocks: rewriteLinks(source.blocks, hrefToId),
            outgoingLinks: [...new Set(hrefToId.values())],
          });
        } catch {
          warnings.push(`Links da página “${source.title}” não foram reconectados`);
        }
      }
    }
  }

  const rootKey = plan.pages.find((page) => !page.parentKey)?.key;
  return {
    notebookIds: Object.values(committed.notebookIds),
    pageIds: Object.values(committed.pageIds),
    firstPageId: rootKey ? committed.pageIds[rootKey] ?? null : null,
    warnings,
  };
}

/** Points image/file blocks at their uploaded Storage URL. */
function rewriteMedia(blocks: AppBlock[], urlByPath: Map<string, string>): AppBlock[] {
  return blocks.map((block) => {
    const next: AppBlock = { ...block };

    if (next.media?.url && !/^https?:\/\//i.test(next.media.url)) {
      const url = resolveMediaUrl(next.media.url, urlByPath);
      next.media = url
        ? { ...next.media, url, pending: false }
        : // Nothing was uploaded for this reference — drop the dead relative
          // URL so the editor renders a placeholder instead of a broken image.
          { ...next.media, url: "", pending: false };
    }

    if (next.children?.length) next.children = rewriteMedia(next.children, urlByPath);
    return next;
  });
}

function resolveMediaUrl(reference: string, urlByPath: Map<string, string>): string | null {
  const direct = urlByPath.get(reference);
  if (direct) return direct;

  const name = reference.split("/").pop() ?? reference;
  for (const [path, url] of urlByPath) {
    if (path.endsWith(reference) || reference.endsWith(path)) return url;
    if ((path.split("/").pop() ?? path) === name) return url;
  }
  return null;
}

/** Maps each page's relative links to the ids the commit allocated. */
function collectLinkRewrites(
  plan: ImportPlan,
  pageIds: Record<string, string>
): Map<string, Map<string, string>> {
  const result = new Map<string, Map<string, string>>();

  for (const [key, links] of plan.pendingLinks) {
    const resolved = new Map<string, string>();
    for (const href of links) {
      const targetKey = resolveLinkTarget(href, plan);
      const targetId = targetKey ? pageIds[targetKey] : undefined;
      if (targetId) resolved.set(href, targetId);
    }
    if (resolved.size) result.set(key, resolved);
  }
  return result;
}

/** Notion's relative links carry the target's 32-hex id, which is the join key. */
function resolveLinkTarget(href: string, plan: ImportPlan): string | undefined {
  const notionId = /([0-9a-f]{32})/i.exec(href)?.[1]?.toLowerCase();
  if (notionId && plan.pageByNotionId.has(notionId)) return plan.pageByNotionId.get(notionId);

  const normalized = href.replace(/^\.\//, "");
  if (plan.pageByPath.has(normalized)) return plan.pageByPath.get(normalized);
  for (const [path, key] of plan.pageByPath) {
    if (path.endsWith(normalized)) return key;
  }
  return undefined;
}

/** Replaces resolved hrefs with internal page links. */
function rewriteLinks(blocks: AppBlock[], hrefToId: Map<string, string>): AppBlock[] {
  const rewriteSpans = (spans?: RichTextSpan[]): RichTextSpan[] | undefined =>
    spans?.map((span) => {
      if (!span.href) return span;
      const pageId = hrefToId.get(span.href);
      return pageId ? { ...span, href: `/app/p/${pageId}` } : span;
    });

  return blocks.map((block) => ({
    ...block,
    richText: rewriteSpans(block.richText),
    children: block.children ? rewriteLinks(block.children, hrefToId) : undefined,
    props: block.props?.tableRows
      ? {
          ...block.props,
          tableRows: block.props.tableRows.map((row) =>
            row.map((cell) => rewriteSpans(cell) ?? cell)
          ),
        }
      : block.props,
  }));
}

/** Re-exported so the dialog can label a single-page export sensibly. */
export { commonPrefixDepth, isImage };
