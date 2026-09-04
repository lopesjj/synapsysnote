import type { Notebook } from "@/types/models";
import { compareNatural } from "@/lib/utils";

/**
 * Hierarchy helpers for notebooks. `parentId` was added after the first
 * workspaces shipped, so every reader treats a missing field as a root.
 */

export function parentIdOf(notebook: Pick<Notebook, "parentId">): string | null {
  const parentId = notebook.parentId;
  if (!parentId || parentId === "null") return null;
  return parentId;
}

export function childrenOf(notebooks: Notebook[], parentId: string | null): Notebook[] {
  return notebooks
    .filter((notebook) => parentIdOf(notebook) === parentId)
    .sort((a, b) => a.order - b.order || compareNatural(a.name, b.name));
}

/** Root → current, walking `parentId`. Guards against a cycle in stale data. */
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
  notebooks: Array<Pick<Notebook, "id" | "parentId">>,
  candidateId: string,
  ancestorId: string
): boolean {
  if (candidateId === ancestorId) return false;
  const byId = new Map(notebooks.map((notebook) => [notebook.id, notebook]));
  const seen = new Set<string>();
  let current = byId.get(candidateId)?.parentId ?? null;
  while (current && !seen.has(current)) {
    if (current === ancestorId) return true;
    seen.add(current);
    current = byId.get(current)?.parentId ?? null;
  }
  return false;
}

/** Direct children of a deleted notebook, plus any deeper descendants. */
export function descendantNotebooks<T extends Pick<Notebook, "id" | "parentId">>(
  notebooks: T[],
  notebookId: string
): T[] {
  return notebooks.filter((notebook) => isNotebookDescendant(notebooks, notebook.id, notebookId));
}

/** The notebook itself and every nested caderno underneath it. */
export function notebookSubtreeIds(
  notebooks: Array<Pick<Notebook, "id" | "parentId">>,
  notebookId: string
): string[] {
  return [notebookId, ...descendantNotebooks(notebooks, notebookId).map((notebook) => notebook.id)];
}
