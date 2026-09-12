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

export interface NoteCreationTarget {
  notebookId: string | null;
  parentPageId: string | null;
}

export function resolveNoteCreationTarget(
  pathname: string | null,
  pages: Page[],
  databases: { id: string; notebookId?: string | null }[] = []
): NoteCreationTarget {
  if (!pathname) return { notebookId: null, parentPageId: null };

  if (pathname.startsWith("/home/p/")) {
    const pageId = pathname.slice("/home/p/".length).split("/")[0].split("?")[0];
    const currentPage = pages.find((p) => p.id === pageId);
    if (currentPage) {
      return {
        notebookId: currentPage.notebookId ?? null,
        parentPageId: currentPage.parentPageId ?? null,
      };
    }
  }

  if (pathname.startsWith("/home/n/")) {
    const notebookId = pathname.slice("/home/n/".length).split("/")[0].split("?")[0];
    return {
      notebookId: notebookId || null,
      parentPageId: null,
    };
  }

  if (pathname.startsWith("/home/db/")) {
    const databaseId = pathname.slice("/home/db/".length).split("/")[0].split("?")[0];
    const db = databases.find((d) => d.id === databaseId);
    return {
      notebookId: db?.notebookId ?? null,
      parentPageId: null,
    };
  }

  return { notebookId: null, parentPageId: null };
}

export function expandContainerInSession(target: NoteCreationTarget) {
  if (typeof window === "undefined") return;
  try {
    if (target.notebookId) {
      const openNotebooks = JSON.parse(sessionStorage.getItem("synapsys_open_notebooks") || "{}");
      openNotebooks[target.notebookId] = true;
      sessionStorage.setItem("synapsys_open_notebooks", JSON.stringify(openNotebooks));
    }
    if (target.parentPageId) {
      const expandedPages = JSON.parse(sessionStorage.getItem("synapsys_expanded_pages") || "{}");
      expandedPages[target.parentPageId] = true;
      sessionStorage.setItem("synapsys_expanded_pages", JSON.stringify(expandedPages));
    }
  } catch {}
}
