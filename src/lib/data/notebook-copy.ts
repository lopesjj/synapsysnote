import type { Notebook } from "@/types/models";
import { parentIdOf } from "./notebook-tree";

/** Root notebooks are páginas; nested ones are cadernos. */
export function isNestedNotebook(notebook: Pick<Notebook, "parentId">): boolean {
  return Boolean(parentIdOf(notebook));
}

export function childNotebookCountLabel(count: number): string {
  return count === 1 ? "caderno" : "cadernos";
}

export const NOTEBOOK_COPY = {
  newRootName: "Nova página",
  newChildName: "Novo caderno",
  newChildAction: "Novo caderno",
  childrenHeading: "Cadernos",
  emptyDescription: "Crie um caderno para organizar ou adicione a primeira nota.",
  createdRoot: "Página criada",
  createdChild: "Caderno criado",
  removedRoot: "Página removida",
  removedChild: "Caderno removido",
  duplicatedRoot: "Página duplicada",
  duplicatedChild: "Caderno duplicado",
  missing: "Esta página não existe mais",
  missingHint: "Pode ter sido excluída ou o endereço está desatualizado.",
  allRoots: "Todas as páginas",
  unfiled: "Sem página",
  sectionRoots: "Páginas",
} as const;

export function emptyNotebookTitle(notebook: Pick<Notebook, "parentId">): string {
  return isNestedNotebook(notebook) ? "Este caderno está vazio" : "Esta página está vazia";
}

export function notebookNamePlaceholder(notebook: Pick<Notebook, "parentId">): string {
  return isNestedNotebook(notebook) ? "Nome do caderno" : "Nome da página";
}

export function openNotebookLabel(notebook: Pick<Notebook, "parentId">): string {
  return isNestedNotebook(notebook) ? "Abrir caderno" : "Abrir página";
}

export function deleteNotebookLabel(notebook: Pick<Notebook, "parentId">): string {
  return isNestedNotebook(notebook) ? "Excluir caderno" : "Excluir página";
}

export function duplicateNotebookLabel(notebook: Pick<Notebook, "parentId">): string {
  return isNestedNotebook(notebook) ? "Duplicar caderno" : "Duplicar página";
}

export function deleteNotebookConfirm(notebook: Pick<Notebook, "parentId" | "name">): string {
  const isNested = isNestedNotebook(notebook);
  const target = isNested ? "deste caderno" : "desta página";
  const name = notebook.name?.trim() || (isNested ? "caderno" : "página");
  return `Excluir "${name}" e tudo que está dentro ${target}? As notas vão para a lixeira.`;
}

export function iconNotebookLabel(notebook: Pick<Notebook, "parentId">): string {
  return isNestedNotebook(notebook) ? "Trocar ícone do caderno" : "Trocar ícone da página";
}

export function collapseNotebookLabel(open: boolean, notebook: Pick<Notebook, "parentId">): string {
  const kind = isNestedNotebook(notebook) ? "caderno" : "página";
  return open ? `Recolher ${kind}` : `Expandir ${kind}`;
}
