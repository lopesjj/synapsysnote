import type { Page } from "@/types/models";


export function descendantsOf(pages: Page[], pageId: string): Page[] {
  return pages.filter((page) => page.path.includes(pageId));
}

export function pageSubtree(pages: Page[], pageId: string): Page[] {
  return pages.filter((page) => page.id === pageId || page.path.includes(pageId));
}

export function rebasePath(
  descendantPath: string[],
  movedPageId: string,
  movedNewPath: string[]
): string[] {
  const pivot = descendantPath.indexOf(movedPageId);
  if (pivot < 0) return descendantPath;
  return [...movedNewPath, movedPageId, ...descendantPath.slice(pivot + 1)];
}

export interface SubtreePatch {
  pageId: string;
  path: string[];
  notebookId: string | null;
}

export function subtreePatches(
  pages: Page[],
  movedPageId: string,
  movedNewPath: string[],
  notebookId: string | null
): SubtreePatch[] {
  return descendantsOf(pages, movedPageId).map((descendant) => ({
    pageId: descendant.id,
    path: rebasePath(descendant.path, movedPageId, movedNewPath),
    notebookId,
  }));
}
