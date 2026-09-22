import type { DataAdapter } from "@/lib/data/adapter";
import type { ImportTreeNode, Notebook } from "@/types/models";
import { persistImportedNote, type ImportedNoteResult } from "./run-import";
import type { ImportedNote } from "./types";

export interface ImportedNoteTree {
  note?: ImportedNote;
  container?: { title: string; icon?: string | null };
  children?: ImportedNoteTree[];
}

export interface TreeImportOptions {
  adapter: DataAdapter;
  roots: ImportTreeNode[];
  selectedIds: Set<string>;
  targetNotebookId: string | null;
  preserveStructure: boolean;
  uploadMedia: boolean;
  keepTags: boolean;
  fallbackTitle: string;
  provider: string;
  containerEmoji?: string;
  existingNotebooks?: Notebook[];
  fetchNote: (node: ImportTreeNode) => Promise<ImportedNoteTree | null>;
  isCanceled?: () => boolean;
  onFileUploaded?: () => void;
  onNodeStart?: (processed: number, total: number, node: ImportTreeNode) => void;
  onNodeFinish?: (result: ImportedNoteResult, processed: number, total: number) => void;
}

export function buildTreeFromNotes(notes: ImportedNote[]): {
  roots: ImportTreeNode[];
  notesById: Map<string, ImportedNote>;
} {
  const roots: ImportTreeNode[] = [];
  const containers = new Map<string, ImportTreeNode>();
  const notesById = new Map<string, ImportedNote>();

  for (const note of notes) {
    notesById.set(note.sourceId, note);

    const document: ImportTreeNode = {
      id: note.sourceId,
      title: note.title,
      kind: "document",
      icon: "📄",
    };

    const path = (note.containerPath ?? []).map((segment) => segment.trim()).filter(Boolean);
    if (!path.length) {
      roots.push(document);
      continue;
    }

    let siblings = roots;
    let key = "";
    for (const segment of path) {
      key = key ? `${key}/${segment}` : segment;
      let container = containers.get(key);
      if (!container) {
        container = {
          id: `container:${key}`,
          title: segment,
          kind: "container",
          icon: "📓",
          children: [],
        };
        containers.set(key, container);
        siblings.push(container);
      }
      siblings = container.children!;
    }
    siblings.push(document);
  }

  return { roots, notesById };
}

export function flattenTree(nodes: ImportTreeNode[]): ImportTreeNode[] {
  const out: ImportTreeNode[] = [];
  const walk = (list: ImportTreeNode[]) => {
    for (const node of list) {
      out.push(node);
      if (node.children?.length) walk(node.children);
    }
  };
  walk(nodes);
  return out;
}

export function collectDocumentIds(nodes: ImportTreeNode[]): string[] {
  return flattenTree(nodes)
    .filter((node) => node.kind === "document")
    .map((node) => node.id);
}

export function nodeAndDescendantIds(node: ImportTreeNode): string[] {
  return flattenTree([node]).map((item) => item.id);
}

export function countSelectedDocuments(nodes: ImportTreeNode[], selected: Set<string>): number {
  return flattenTree(nodes).filter((node) => node.kind === "document" && selected.has(node.id)).length;
}

function hasSelectedDocument(node: ImportTreeNode, selected: Set<string>): boolean {
  if (node.kind === "document" && selected.has(node.id)) return true;
  return (node.children ?? []).some((child) => hasSelectedDocument(child, selected));
}

export async function runTreeImport(options: TreeImportOptions): Promise<ImportedNoteResult[]> {
  const {
    adapter,
    roots,
    selectedIds,
    targetNotebookId,
    preserveStructure,
    uploadMedia,
    keepTags,
    fallbackTitle,
  } = options;

  const results: ImportedNoteResult[] = [];
  const total = countSelectedDocuments(roots, selectedIds);
  const notebookCache = new Map<string, string>();
  let processed = 0;

  const resolveNotebook = async (
    key: string,
    name: string,
    parentNotebookId: string | null,
    icon?: string | null
  ): Promise<string | null> => {
    const cacheKey = `${parentNotebookId ?? "root"}:${key}`;
    const cached = notebookCache.get(cacheKey);
    if (cached) return cached;

    const safeName = (name || fallbackTitle).slice(0, 120);
    const existing = (options.existingNotebooks ?? []).find(
      (item) => item.name === safeName && (item.parentId ?? null) === parentNotebookId
    );
    if (existing) {
      notebookCache.set(cacheKey, existing.id);
      return existing.id;
    }

    const created = await adapter.createNotebook({
      name: safeName,
      emoji: icon || options.containerEmoji || "📓",
      parentId: parentNotebookId,
    });
    notebookCache.set(cacheKey, created.id);
    return created.id;
  };

  const persistTree = async (
    tree: ImportedNoteTree,
    notebookId: string | null,
    parentPageId: string | null
  ): Promise<ImportedNoteResult[]> => {
    if (tree.container) {
      const containerNotebookId = preserveStructure
        ? await resolveNotebook(
            `doc:${tree.container.title}`,
            tree.container.title,
            notebookId,
            tree.container.icon
          )
        : notebookId;

      const out: ImportedNoteResult[] = [];
      for (const child of tree.children ?? []) {
        if (options.isCanceled?.()) break;
        out.push(...(await persistTree(child, containerNotebookId, null)));
      }
      return out;
    }

    if (!tree.note) return [];

    const result = await persistImportedNote({
      adapter,
      note: tree.note,
      fallbackTitle,
      notebookId,
      parentPageId,
      uploadMedia,
      keepTags,
      isCanceled: options.isCanceled,
      onFileUploaded: options.onFileUploaded,
    });

    const out = [result];
    if (result.status === "done" && result.pageId && tree.children?.length) {
      for (const child of tree.children) {
        if (options.isCanceled?.()) break;
        out.push(...(await persistTree(child, notebookId, result.pageId)));
      }
    }
    return out;
  };

  const walk = async (
    nodes: ImportTreeNode[],
    notebookId: string | null,
    parentPageId: string | null
  ) => {
    for (const node of nodes) {
      if (options.isCanceled?.()) return;
      if (!hasSelectedDocument(node, selectedIds)) continue;

      if (node.kind === "container") {
        const nextNotebookId = preserveStructure
          ? await resolveNotebook(node.id, node.title, notebookId, node.icon)
          : notebookId;
        await walk(node.children ?? [], nextNotebookId, preserveStructure ? null : parentPageId);
        continue;
      }

      let createdPageId: string | null = null;

      if (selectedIds.has(node.id)) {
        processed += 1;
        options.onNodeStart?.(processed, total, node);

        let produced: ImportedNoteResult[];
        try {
          const tree = await options.fetchNote(node);
          if (!tree) {
            produced = [
              {
                sourceId: node.id,
                title: node.title || fallbackTitle,
                source: "html",
                sourceFileName: node.title || fallbackTitle,
                pageId: null,
                status: "error",
                errorMessage: "empty_document",
                warnings: [],
                uploadedFiles: 0,
              },
            ];
          } else {
            produced = await persistTree(tree, notebookId, preserveStructure ? parentPageId : null);
            createdPageId = produced.find((item) => item.pageId)?.pageId ?? null;
          }
        } catch (error) {
          produced = [
            {
              sourceId: node.id,
              title: node.title || fallbackTitle,
              source: "html",
              sourceFileName: node.title || fallbackTitle,
              pageId: null,
              status: "error",
              errorMessage: error instanceof Error ? error.message : String(error),
              warnings: [],
              uploadedFiles: 0,
            },
          ];
        }

        results.push(...produced);
        options.onNodeFinish?.(produced[produced.length - 1], processed, total);
      }

      if (node.children?.length) {
        await walk(
          node.children,
          notebookId,
          preserveStructure ? (createdPageId ?? parentPageId) : null
        );
      }
    }
  };

  await walk(roots, targetNotebookId, null);

  if (adapter.recordCompletedImportJob && results.length > 0) {
    try {
      const doneCount = results.filter((item) => item.status === "done").length;
      const filesCount = results.reduce((sum, item) => sum + item.uploadedFiles, 0);
      await adapter.recordCompletedImportJob({
        provider: options.provider,
        title: results[0]?.title || fallbackTitle,
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
        items: results.map((item) => ({
          notionId: item.sourceId || "import_item",
          title: item.title,
          type: "page",
          status: item.status,
          fileCount: item.uploadedFiles,
        })),
      });
    } catch {}
  }

  return results;
}
