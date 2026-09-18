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
  | {
      kind: "move-notebook";
      notebookId: string;
      parentId: string | null;
      notebookIds: string[];
    }
  | {
      kind: "move-page";
      pageId: string;
      notebookId: string | null;
      parentPageId: string | null;
      pageIds: string[];
    }
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

export type DropIntentMode = "before" | "after" | "inside" | "reorder";

export function planSidebarDrop(
  activeRawId: string | number,
  overRawId: string | number | null | undefined,
  { notebooks, pages }: SidebarSnapshot,
  intent?: DropIntentMode
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

    if (draggedParent === null) {
      if (intent === "inside" || targetParent !== null) return null;
      const without = siblings.filter((n) => n.id !== dragged.id);
      const targetIdx = without.findIndex((n) => n.id === target.id);
      if (targetIdx < 0) return null;
      let insertAt = targetIdx;
      if (intent === "after") {
        insertAt = targetIdx + 1;
      } else if (intent === "before") {
        insertAt = targetIdx;
      } else {
        const from = siblings.findIndex((n) => n.id === dragged.id);
        insertAt = from >= 0 && from < targetIdx ? targetIdx + 1 : targetIdx;
      }
      const ordered = without.map((n) => n.id);
      ordered.splice(insertAt, 0, dragged.id);
      const from = siblings.findIndex((n) => n.id === dragged.id);
      const to = ordered.findIndex((id) => id === dragged.id);
      if (from === to) return null;
      return {
        kind: "reorder-notebooks",
        notebookIds: ordered,
      };
    }

    if (intent === "inside" || (over.kind === "notebook" && !intent)) {
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
      const without = siblings.filter((n) => n.id !== dragged.id);
      const targetIdx = without.findIndex((n) => n.id === target.id);
      if (targetIdx < 0) return null;
      let insertAt = targetIdx;
      if (intent === "after") {
        insertAt = targetIdx + 1;
      } else if (intent === "before") {
        insertAt = targetIdx;
      } else {
        const from = siblings.findIndex((n) => n.id === dragged.id);
        insertAt = from >= 0 && from < targetIdx ? targetIdx + 1 : targetIdx;
      }
      const ordered = without.map((n) => n.id);
      ordered.splice(insertAt, 0, dragged.id);
      const from = siblings.findIndex((n) => n.id === dragged.id);
      const to = ordered.findIndex((id) => id === dragged.id);
      if (from === to) return null;
      return {
        kind: "reorder-notebooks",
        notebookIds: ordered,
      };
    }

    if (draggedParent === target.id) return null;

    const destination = childrenOf(notebooks, targetParent).filter(
      (notebook) => notebook.id !== dragged.id
    );
    const targetIdx = destination.findIndex((n) => n.id === target.id);
    const insertAt =
      targetIdx < 0
        ? destination.length
        : intent === "after"
          ? targetIdx + 1
          : targetIdx;
    const ordered = destination.map((n) => n.id);
    ordered.splice(insertAt, 0, dragged.id);
    return {
      kind: "move-notebook",
      notebookId: dragged.id,
      parentId: targetParent,
      notebookIds: ordered,
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

  const targetParentId = target.parentPageId;
  const targetNotebookId = target.notebookId;
  const siblings = siblingsOf(pages, targetNotebookId, targetParentId);
  const without = siblings.filter((sibling) => sibling.id !== page.id);
  const targetIdx = without.findIndex((sibling) => sibling.id === target.id);
  if (targetIdx < 0) return null;

  let insertAt = targetIdx;
  if (intent === "after") {
    insertAt = targetIdx + 1;
  } else if (intent === "before") {
    insertAt = targetIdx;
  } else {
    const from = siblings.findIndex((s) => s.id === page.id);
    insertAt = from >= 0 && from < targetIdx ? targetIdx + 1 : targetIdx;
  }

  const ordered = without.map((sibling) => sibling.id);
  ordered.splice(insertAt, 0, page.id);

  const sameParent =
    page.notebookId === targetNotebookId && page.parentPageId === targetParentId;

  if (sameParent) {
    const from = siblings.findIndex((sibling) => sibling.id === page.id);
    const to = ordered.findIndex((id) => id === page.id);
    if (from === to) return null;
    return {
      kind: "reorder-pages",
      pageIds: ordered,
    };
  }

  return {
    kind: "move-page",
    pageId: page.id,
    notebookId: targetNotebookId,
    parentPageId: targetParentId,
    pageIds: ordered,
  };
}
