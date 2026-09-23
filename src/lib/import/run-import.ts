import type { AppBlock } from "@/types/models";
import type { DataAdapter } from "@/lib/data/adapter";
import { bytesToBlob, mimeFromName } from "./binary";
import { assetIdFromUrl, isAssetUrl, type ImportedAsset, type ImportedNote, type ImportWarningCode } from "./types";

export interface ImportedNoteResult {
  sourceId: string;
  title: string;
  source: ImportedNote["source"];
  sourceFileName: string;
  pageId: string | null;
  status: "done" | "error";
  errorMessage?: string;
  warnings: ImportWarningCode[];
  uploadedFiles: number;
}

export interface RunImportOptions {
  adapter: DataAdapter;
  notes: ImportedNote[];
  targetNotebookId: string | null;
  uploadMedia: boolean;
  keepTags: boolean;
  fallbackTitle: string;
  provider?: string;
  recordJob?: boolean;
  isCanceled?: () => boolean;
  onNoteStart?: (index: number, note: ImportedNote) => void;
  onNoteFinish?: (result: ImportedNoteResult, index: number) => void;
  onFileUploaded?: (uploaded: number, total: number) => void;
}

type ResolvedAsset = { url: string; storagePath?: string };

const SOURCE_TAG: Partial<Record<ImportedNote["source"], string>> = {
  evernote: "evernote",
  "google-docs": "google-docs",
  docx: "word",
};

function importedNoteTags(note: ImportedNote, keepTags: boolean): string[] {
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const tag of [SOURCE_TAG[note.source], ...(keepTags ? note.tags : [])]) {
    const value = tag?.trim();
    if (!value || seen.has(value.toLowerCase())) continue;
    seen.add(value.toLowerCase());
    tags.push(value);
  }
  return tags.slice(0, 50);
}

function walkBlocks(blocks: AppBlock[], visit: (block: AppBlock) => void) {
  for (const block of blocks) {
    visit(block);
    if (block.children?.length) walkBlocks(block.children, visit);
  }
}

export function countAssetReferences(blocks: AppBlock[]): number {
  let total = 0;
  walkBlocks(blocks, (block) => {
    if (block.media?.url && isAssetUrl(block.media.url)) total += 1;
  });
  return total;
}

export function stripPendingMedia(blocks: AppBlock[]): AppBlock[] {
  const out: AppBlock[] = [];
  for (const block of blocks) {
    if (block.media?.url && isAssetUrl(block.media.url)) continue;
    const next: AppBlock = { ...block };
    const children = block.children?.length ? stripPendingMedia(block.children) : [];
    if (children.length) next.children = children;
    else delete next.children;
    out.push(next);
  }
  return out;
}

export function applyResolvedAssets(blocks: AppBlock[], resolved: Map<string, ResolvedAsset>): AppBlock[] {
  const out: AppBlock[] = [];
  for (const block of blocks) {
    const children = block.children?.length ? applyResolvedAssets(block.children, resolved) : undefined;
    const next: AppBlock = { ...block };
    if (children?.length) next.children = children;
    else delete next.children;

    if (next.media?.url && isAssetUrl(next.media.url)) {
      const target = resolved.get(assetIdFromUrl(next.media.url));
      if (!target) continue;
      next.media = {
        ...next.media,
        url: target.url,
        ...(target.storagePath ? { storagePath: target.storagePath } : {}),
        pending: false,
      };
    }
    out.push(next);
  }
  return out;
}

function assetToFile(asset: ImportedAsset): File {
  const mimeType = asset.mimeType || mimeFromName(asset.name);
  const blob = bytesToBlob(asset.bytes, mimeType);
  return new File([blob], asset.name || "arquivo", { type: mimeType, lastModified: Date.now() });
}

async function rehostRemoteMedia(
  adapter: DataAdapter,
  pageId: string,
  blocks: AppBlock[]
): Promise<AppBlock[]> {
  if (typeof window === "undefined") return blocks;
  const cache = new Map<string, ResolvedAsset | null>();

  const resolve = async (url: string): Promise<ResolvedAsset | null> => {
    if (cache.has(url)) return cache.get(url) ?? null;
    let result: ResolvedAsset | null = null;
    try {
      const response = await fetch(`/api/media/proxy?url=${encodeURIComponent(url)}`);
      if (response.ok) {
        const blob = await response.blob();
        if (blob.size > 0) {
          const name = url.split("/").pop()?.split("?")[0] || "imagem";
          const type = blob.type || mimeFromName(name, "image/png");
          const file = new File([blob], name.includes(".") ? name : `${name}.png`, { type });
          result = await adapter.uploadAttachment(pageId, file);
        }
      }
    } catch {
      result = null;
    }
    cache.set(url, result);
    return result;
  };

  const mapBlocks = async (list: AppBlock[]): Promise<AppBlock[]> => {
    const out: AppBlock[] = [];
    for (const block of list) {
      const next: AppBlock = { ...block };
      if (next.children?.length) next.children = await mapBlocks(next.children);
      const url = next.media?.url;
      if (url && /^https?:\/\//i.test(url) && !url.includes("firebasestorage.googleapis.com")) {
        const resolved = await resolve(url);
        if (resolved) {
          next.media = {
            ...next.media!,
            url: resolved.url,
            ...(resolved.storagePath ? { storagePath: resolved.storagePath } : {}),
            pending: false,
          };
        }
      }
      out.push(next);
    }
    return out;
  };

  return mapBlocks(blocks);
}

export interface PersistNoteOptions {
  adapter: DataAdapter;
  note: ImportedNote;
  fallbackTitle: string;
  notebookId: string | null;
  parentPageId?: string | null;
  uploadMedia: boolean;
  keepTags: boolean;
  isCanceled?: () => boolean;
  onFileUploaded?: () => void;
}

export async function persistImportedNote(
  options: PersistNoteOptions
): Promise<ImportedNoteResult> {
  const { adapter, note, fallbackTitle, uploadMedia, keepTags } = options;

  const result: ImportedNoteResult = {
    sourceId: note.sourceId,
    title: note.title || fallbackTitle,
    source: note.source,
    sourceFileName: note.sourceFileName,
    pageId: null,
    status: "done",
    warnings: [...note.warnings],
    uploadedFiles: 0,
  };

  try {
    const initialBlocks = stripPendingMedia(note.blocks);
    const page = await adapter.createPage({
      title: (note.title || fallbackTitle).slice(0, 200),
      notebookId: options.notebookId,
      parentPageId: options.parentPageId ?? null,
      tags: importedNoteTags(note, keepTags),
      ...(initialBlocks.length ? { blocks: initialBlocks } : {}),
      importSource: note.source,
    });
    result.pageId = page.id;

    const referenced = new Set<string>();
    walkBlocks(note.blocks, (block) => {
      if (block.media?.url && isAssetUrl(block.media.url)) referenced.add(assetIdFromUrl(block.media.url));
    });

    const resolved = new Map<string, ResolvedAsset>();
    if (uploadMedia) {
      for (const asset of note.assets) {
        if (!referenced.has(asset.id)) continue;
        if (options.isCanceled?.()) break;
        try {
          const uploaded = await adapter.uploadAttachment(page.id, assetToFile(asset));
          resolved.set(asset.id, uploaded);
          result.uploadedFiles += 1;
          options.onFileUploaded?.();
        } catch {
          if (!result.warnings.includes("missing_asset")) result.warnings.push("missing_asset");
        }
      }
    } else if (referenced.size) {
      if (!result.warnings.includes("missing_asset")) result.warnings.push("missing_asset");
    }

    let finalBlocks = applyResolvedAssets(note.blocks, resolved);
    if (uploadMedia) finalBlocks = await rehostRemoteMedia(adapter, page.id, finalBlocks);

    if (finalBlocks.length) await adapter.updatePage(page.id, { blocks: finalBlocks });
  } catch (error) {
    result.status = "error";
    result.errorMessage = error instanceof Error ? error.message : String(error);
  }

  return result;
}

export async function runFileImport(options: RunImportOptions): Promise<ImportedNoteResult[]> {
  const { adapter, notes, targetNotebookId, uploadMedia, keepTags, fallbackTitle } = options;
  const results: ImportedNoteResult[] = [];
  const totalFiles = notes.reduce((sum, note) => sum + countAssetReferences(note.blocks), 0);
  let uploadedFiles = 0;

  for (let index = 0; index < notes.length; index += 1) {
    if (options.isCanceled?.()) break;
    const note = notes[index];
    options.onNoteStart?.(index, note);

    const result = await persistImportedNote({
      adapter,
      note,
      fallbackTitle,
      notebookId: targetNotebookId,
      uploadMedia,
      keepTags,
      isCanceled: options.isCanceled,
      onFileUploaded: () => {
        uploadedFiles += 1;
        options.onFileUploaded?.(uploadedFiles, totalFiles);
      },
    });

    results.push(result);
    options.onNoteFinish?.(result, index);
  }

  if (options.recordJob !== false && adapter.recordCompletedImportJob && results.length > 0) {
    try {
      const primaryTitle = results[0]?.title || fallbackTitle;
      const doneCount = results.filter((r) => r.status === "done").length;
      const filesCount = results.reduce((s, r) => s + r.uploadedFiles, 0);
      const detectedProvider =
        options.provider ||
        (notes[0]?.source === "google-docs"
          ? "google_docs"
          : notes[0]?.source === "docx"
            ? "docx"
            : notes[0]?.source === "evernote"
              ? "enex"
              : "file");

      await adapter.recordCompletedImportJob({
        provider: detectedProvider,
        title: primaryTitle,
        totalPages: results.length,
        processedPages: doneCount,
        totalFiles: filesCount,
        processedFiles: filesCount,
        status: options.isCanceled?.()
          ? "canceled"
          : doneCount === results.length
            ? "completed"
            : doneCount > 0
              ? "completed_with_errors"
              : "failed",
        items: results.map((r) => ({
          notionId: r.sourceId || "import_item",
          title: r.title,
          type: "page",
          status: r.status,
          fileCount: r.uploadedFiles,
        })),
      });
    } catch {}
  }

  return results;
}
