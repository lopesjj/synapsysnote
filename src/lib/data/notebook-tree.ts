import type { Notebook } from "@/types/models";
import { compareNatural } from "@/lib/utils";


export function parentIdOf(notebook: Pick<Notebook, "parentId">): string | null {
  const parentId = notebook.parentId;
  if (!parentId || parentId === "null") return null;
  return parentId;
}

export function isNestedNotebook(notebook: Pick<Notebook, "parentId">): boolean {
  return Boolean(parentIdOf(notebook));
}

export function isParkedNotebook(
  notebook: Pick<Notebook, "parentId"> & { archivedFromParentId?: string | null }
): boolean {
  return !parentIdOf(notebook) && Boolean(notebook.archivedFromParentId);
}

export function presentsAsNotebook(
  notebook: Pick<Notebook, "parentId"> & { archivedFromParentId?: string | null }
): boolean {
  return isNestedNotebook(notebook) || isParkedNotebook(notebook);
}

export function childrenOf(notebooks: Notebook[], parentId: string | null): Notebook[] {
  return notebooks
    .filter((notebook) => parentIdOf(notebook) === parentId)
    .sort((a, b) => a.order - b.order || compareNatural(a.name, b.name));
}

export function notebookAncestors(notebooks: Notebook[], notebookId: string): Notebook[] {
  const byId = new Map(notebooks.map((notebook) => [notebook.id, notebook]));
  const chain: Notebook[] = [];
  const seen = new Set<string>();
  let current = byId.get(notebookId) ?? null;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    chain.unshift(current);
    const parentId = parentIdOf(current);
    current = parentId ? (byId.get(parentId) ?? null) : null;
  }
  return chain;
}

export function isNotebookDescendant(
  notebooks: Array<Pick<Notebook, "id" | "parentId"> & { archivedFromParentId?: string | null }>,
  candidateId: string,
  ancestorId: string
): boolean {
  if (candidateId === ancestorId) return false;
  const byId = new Map(notebooks.map((notebook) => [notebook.id, notebook]));
  const seen = new Set<string>();
  const initial = byId.get(candidateId);
  let current = initial?.parentId ?? initial?.archivedFromParentId ?? null;
  while (current && !seen.has(current)) {
    if (current === ancestorId) return true;
    seen.add(current);
    const parent = byId.get(current);
    current = parent?.parentId ?? parent?.archivedFromParentId ?? null;
  }
  return false;
}

export function descendantNotebooks<
  T extends Pick<Notebook, "id" | "parentId"> & { archivedFromParentId?: string | null }
>(
  notebooks: T[],
  notebookId: string
): T[] {
  return notebooks.filter((notebook) => isNotebookDescendant(notebooks, notebook.id, notebookId));
}

export function notebookSubtreeIds(
  notebooks: Array<Pick<Notebook, "id" | "parentId">>,
  notebookId: string
): string[] {
  return [notebookId, ...descendantNotebooks(notebooks, notebookId).map((notebook) => notebook.id)];
}
