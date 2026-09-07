import type { Notebook, Page } from "@/types/models";
import { childrenOf, isNotebookDescendant, parentIdOf } from "@/lib/data/notebook-tree";


export type DragKind = "notebook" | "page";

export interface DragId {
  kind: DragKind;
  id: string;
}

export function encodeId(kind: DragKind, id: string): string {
  return `${kind}:${id}`;
}

export function decodeId(value: string | number): DragId | null {
  const raw = String(value);
  const separator = raw.indexOf(":");
  if (separator < 0) return null;
  const kind = raw.slice(0, separator);
  if (kind !== "notebook" && kind !== "page") return null;
  return { kind, id: raw.slice(separator + 1) };
}

export const ORDER_STEP = 100;

export type DropPlan =
  | { kind: "reorder-notebooks"; notebookIds: string[] }
  /** Notebook moved under another caderno (or back to the root). */
  | {
      kind: "move-notebook";
      notebookId: string;
      parentId: string | null;
      notebookIds: string[];
    }
  /**
   * Page moved to a new parent and/or notebook. `pageIds` is the resulting
   * sibling order at the destination, so the move and the placement are one
   * atomic intent rather than two.
   */
  | {
      kind: "move-page";
      pageId: string;
      notebookId: string | null;
      parentPageId: string | null;
      pageIds: string[];
    }
  /** New sibling order within an unchanged parent. */
  | { kind: "reorder-pages"; pageIds: string[] };

export interface SidebarSnapshot {
  notebooks: Notebook[];
  pages: Page[];
}

function moveItem<T>(items: T[], from: number, to: number): T[] {
  const next = items.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function bySiblingOrder(a: Page, b: Page): number {
  return a.order - b.order || a.title.localeCompare(b.title, "pt-BR");
}

function siblingsOf(pages: Page[], notebookId: string | null, parentPageId: string | null): Page[] {
  return pages
    .filter((page) => page.notebookId === notebookId && page.parentPageId === parentPageId)
    .sort(bySiblingOrder);
}

function isDescendant(pages: Page[], candidate: Page, ancestorId: string): boolean {
  if (candidate.path.includes(ancestorId)) return true;

  const byId = new Map(pages.map((page) => [page.id, page]));
  const seen = new Set<string>();
  let current = candidate.parentPageId;
  while (current && !seen.has(current)) {
    if (current === ancestorId) return true;
    seen.add(current);
    current = byId.get(current)?.parentPageId ?? null;
  }
  return false;
}

export function planSidebarDrop(
  activeRawId: string | number,
  overRawId: string | number | null | undefined,
  { notebooks, pages }: SidebarSnapshot,
  intent?: "reorder" | "inside"
): DropPlan | null {
  if (overRawId === null || overRawId === undefined) return null;
  if (String(activeRawId) === String(overRawId)) return null;

  const active = decodeId(activeRawId);
  const over = decodeId(overRawId);
  if (!active || !over) return null;

  if (active.kind === "notebook") {
    const dragged = notebooks.find((notebook) => notebook.id === active.id);
    if (!dragged) return null;

    const targetNotebookId =
      over.kind === "notebook"
        ? over.id
        : pages.find((page) => page.id === over.id)?.notebookId ?? null;

    const target = notebooks.find((notebook) => notebook.id === targetNotebookId);
    if (!target) return null;
    if (target.id === dragged.id) return null;
    if (isNotebookDescendant(notebooks, target.id, dragged.id)) return null;

    const draggedParent = parentIdOf(dragged);
    const targetParent = parentIdOf(target);
    const siblings = childrenOf(notebooks, draggedParent);

    if (intent === "reorder") {
      if (targetParent === draggedParent) {
        const from = siblings.findIndex((notebook) => notebook.id === dragged.id);
        const to = siblings.findIndex((notebook) => notebook.id === target.id);
        if (from < 0 || to < 0 || from === to) return null;
        return {
          kind: "reorder-notebooks",
          notebookIds: moveItem(siblings, from, to).map((notebook) => notebook.id),
        };
      }
    }

    if (intent === "inside" || over.kind === "notebook") {
      if (draggedParent === target.id) return null;
      const destination = childrenOf(notebooks, target.id).filter(
        (notebook) => notebook.id !== dragged.id
      );
      return {
        kind: "move-notebook",
        notebookId: dragged.id,
        parentId: target.id,
        notebookIds: [...destination.map((notebook) => notebook.id), dragged.id],
      };
    }

    if (targetParent === draggedParent) {
      const from = siblings.findIndex((notebook) => notebook.id === dragged.id);
      const to = siblings.findIndex((notebook) => notebook.id === target.id);
      if (from < 0 || to < 0 || from === to) return null;
      return {
        kind: "reorder-notebooks",
        notebookIds: moveItem(siblings, from, to).map((notebook) => notebook.id),
      };
    }

    if (draggedParent === target.id) return null;

    const destination = childrenOf(notebooks, target.id).filter(
      (notebook) => notebook.id !== dragged.id
    );
    return {
      kind: "move-notebook",
      notebookId: dragged.id,
      parentId: target.id,
      notebookIds: [...destination.map((notebook) => notebook.id), dragged.id],
    };
  }

  const page = pages.find((candidate) => candidate.id === active.id);
  if (!page) return null;

  if (over.kind === "notebook") {
    if (page.notebookId === over.id && !page.parentPageId) return null;

    const destination = siblingsOf(pages, over.id, null).filter(
      (sibling) => sibling.id !== page.id
    );
    return {
      kind: "move-page",
      pageId: page.id,
      notebookId: over.id,
      parentPageId: null,
      pageIds: [...destination.map((sibling) => sibling.id), page.id],
    };
  }

  const target = pages.find((candidate) => candidate.id === over.id);
  if (!target || target.id === page.id) return null;
  if (isDescendant(pages, target, page.id)) return null;

  if (intent === "inside") {
    if (page.notebookId === target.notebookId && page.parentPageId === target.id) return null;
    const destination = siblingsOf(pages, target.notebookId, target.id).filter(
      (sibling) => sibling.id !== page.id
    );
    return {
      kind: "move-page",
      pageId: page.id,
      notebookId: target.notebookId,
      parentPageId: target.id,
      pageIds: [...destination.map((sibling) => sibling.id), page.id],
    };
  }

  const siblings = siblingsOf(pages, target.notebookId, target.parentPageId);
  const sameParent =
    page.notebookId === target.notebookId && page.parentPageId === target.parentPageId;

  if (sameParent) {
    const from = siblings.findIndex((sibling) => sibling.id === page.id);
    const to = siblings.findIndex((sibling) => sibling.id === target.id);
    if (from < 0 || to < 0 || from === to) return null;
    return {
      kind: "reorder-pages",
      pageIds: moveItem(siblings, from, to).map((sibling) => sibling.id),
    };
  }

  const destination = siblings.filter((sibling) => sibling.id !== page.id);
  const insertAt = destination.findIndex((sibling) => sibling.id === target.id);
  const ordered = destination.map((sibling) => sibling.id);
  ordered.splice(insertAt < 0 ? ordered.length : insertAt, 0, page.id);

  return {
    kind: "move-page",
    pageId: page.id,
    notebookId: target.notebookId,
    parentPageId: target.parentPageId,
    pageIds: ordered,
  };
}
