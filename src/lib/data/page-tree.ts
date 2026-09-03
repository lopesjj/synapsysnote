import type { Page } from "@/types/models";

/**
 * Hierarchy maintenance shared by both adapters.
 *
 * `Page.path` is a materialised ancestor chain — it makes reading a subtree one
 * query instead of a recursive walk — and `notebookId` is denormalised onto
 * every page so the sidebar can scope a notebook without traversing. Both are
 * derived data, so moving a page has to rewrite them for the whole subtree, not
 * just for the page that moved. Leaving a descendant behind detaches it: the
 * tree is built by grouping on `notebookId` and `parentPageId`, so a child
 * whose notebook no longer matches its parent's silently re-roots itself in the
 * old notebook.
 */

/** Descendants of `pageId`, identified by their materialised path. */
export function descendantsOf(pages: Page[], pageId: string): Page[] {
  return pages.filter((page) => page.path.includes(pageId));
}

/**
 * The path a descendant should have after its ancestor moved.
 *
 * Everything above the moved page is replaced with its new location; everything
 * below it is preserved, because the move does not reshape the subtree.
 */
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

/** The `path`/`notebookId` updates a move implies for a page's descendants. */
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
