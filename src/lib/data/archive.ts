import type { Notebook, Page } from "@/types/models";
import type { DataAdapter } from "./adapter";
import { descendantNotebooks, parentIdOf } from "./notebook-tree";
import { descendantsOf, rebasePath } from "./page-tree";

export interface NotebookPatchOp {
  id: string;
  patch: Partial<Notebook>;
}

export interface PagePatchOp {
  id: string;
  patch: Partial<Page>;
}

export interface ArchivePlan {
  intent: "archive" | "unarchive";
  isRootPage: boolean;
  notebooks: NotebookPatchOp[];
  pages: PagePatchOp[];
}

type ArchiveHost = Pick<DataAdapter, "updateNotebook" | "updatePage" | "assertPlan">;

function treePages(allPages: Page[], notebookIds: Set<string>): Page[] {
  const directPages = allPages.filter(
    (p) =>
      (p.notebookId && notebookIds.has(p.notebookId)) ||
      (p.archivedFromNotebookId && notebookIds.has(p.archivedFromNotebookId))
  );
  const directPageIds = new Set(directPages.map((p) => p.id));
  const subpageIds = new Set(directPages.flatMap((dp) => descendantsOf(allPages, dp.id).map((sub) => sub.id)));
  const subpages = allPages.filter((p) => !directPageIds.has(p.id) && subpageIds.has(p.id));
  return [...directPages, ...subpages];
}

function hasArchiveOrigin(page: Page): boolean {
  return (
    page.archivedFromNotebookId !== undefined ||
    page.archivedFromParentPageId !== undefined ||
    page.archivedFromPath !== undefined
  );
}

function returnPagePatch(page: Page, archived: boolean): Partial<Page> {
  if (!hasArchiveOrigin(page)) return { archived };
  return {
    archived,
    notebookId:
      page.archivedFromNotebookId !== undefined && page.archivedFromNotebookId !== null
        ? page.archivedFromNotebookId
        : page.notebookId,
    parentPageId:
      page.archivedFromParentPageId !== undefined && page.archivedFromParentPageId !== null
        ? page.archivedFromParentPageId
        : page.parentPageId,
    path:
      page.archivedFromPath !== undefined && page.archivedFromPath !== null ? page.archivedFromPath : page.path,
    archivedFromNotebookId: null,
    archivedFromParentPageId: null,
    archivedFromPath: null,
  };
}

function subtreeNotebookPatch(notebook: Notebook, allNotebooks: Notebook[], archived: boolean): Partial<Notebook> {
  const hasOrigin = archived
    ? notebook.archivedFromParentId !== undefined && notebook.archivedFromParentId !== null
    : Boolean(notebook.archivedFromParentId);
  if (hasOrigin) {
    const validParent = allNotebooks.some((n) => n.id === notebook.archivedFromParentId)
      ? notebook.archivedFromParentId
      : null;
    return { archived, parentId: validParent, archivedFromParentId: null };
  }
  return { archived };
}

export function planUnarchiveNotebookTree(
  allNotebooks: Notebook[],
  allPages: Page[],
  notebookId: string
): ArchivePlan | null {
  const target = allNotebooks.find((n) => n.id === notebookId);
  if (!target) return null;

  const isRootPage = !parentIdOf(target) && !target.archivedFromParentId;
  const subTreeNotebooks = descendantNotebooks(allNotebooks, target.id);
  const allTreeNotebookIds = new Set([target.id, ...subTreeNotebooks.map((n) => n.id)]);

  const notebooks: NotebookPatchOp[] = [
    {
      id: target.id,
      patch: isRootPage
        ? { archived: false, archivedFromParentId: null }
        : {
            archived: false,
            parentId: null,
            archivedFromParentId: target.archivedFromParentId ?? parentIdOf(target),
          },
    },
    ...subTreeNotebooks.map((nb) => ({ id: nb.id, patch: subtreeNotebookPatch(nb, allNotebooks, false) })),
  ];

  const pages = treePages(allPages, allTreeNotebookIds).map((page) => ({
    id: page.id,
    patch: returnPagePatch(page, false),
  }));

  return { intent: "unarchive", isRootPage, notebooks, pages };
}

export function planArchiveNotebookTree(
  allNotebooks: Notebook[],
  allPages: Page[],
  notebookId: string
): ArchivePlan | null {
  const target = allNotebooks.find((n) => n.id === notebookId);
  if (!target) return null;

  const isRootPage = !parentIdOf(target) && !target.archivedFromParentId;
  const subTreeNotebooks = descendantNotebooks(allNotebooks, target.id);
  const allTreeNotebookIds = new Set([target.id, ...subTreeNotebooks.map((n) => n.id)]);

  const notebooks: NotebookPatchOp[] = [
    { id: target.id, patch: subtreeNotebookPatch(target, allNotebooks, true) },
    ...subTreeNotebooks.map((nb) => ({ id: nb.id, patch: subtreeNotebookPatch(nb, allNotebooks, true) })),
  ];

  const pages = treePages(allPages, allTreeNotebookIds).map((page) => ({
    id: page.id,
    patch: returnPagePatch(page, true),
  }));

  return { intent: "archive", isRootPage, notebooks, pages };
}

export function planUnarchivePageTree(allPages: Page[], pageId: string): ArchivePlan | null {
  const target = allPages.find((p) => p.id === pageId);
  if (!target) return null;

  const pages: PagePatchOp[] = [
    {
      id: target.id,
      patch: {
        archived: false,
        notebookId: null,
        parentPageId: null,
        path: [],
        archivedFromNotebookId: target.archivedFromNotebookId ?? target.notebookId,
        archivedFromParentPageId: target.archivedFromParentPageId ?? target.parentPageId,
        archivedFromPath: target.archivedFromPath ?? target.path,
      },
    },
    ...descendantsOf(allPages, target.id).map((sub) => ({
      id: sub.id,
      patch: {
        archived: false,
        notebookId: null,
        path: rebasePath(sub.path, target.id, []),
        archivedFromNotebookId: sub.archivedFromNotebookId ?? sub.notebookId,
        archivedFromParentPageId: sub.archivedFromParentPageId ?? sub.parentPageId,
        archivedFromPath: sub.archivedFromPath ?? sub.path,
      },
    })),
  ];

  return { intent: "unarchive", isRootPage: false, notebooks: [], pages };
}

export function planArchivePageTree(allPages: Page[], pageId: string): ArchivePlan | null {
  const target = allPages.find((p) => p.id === pageId);
  if (!target) return null;

  const archiveWithOrigin = (page: Page): Partial<Page> => ({
    archived: true,
    notebookId:
      page.archivedFromNotebookId !== undefined && page.archivedFromNotebookId !== null
        ? page.archivedFromNotebookId
        : page.notebookId,
    parentPageId:
      page.archivedFromParentPageId !== undefined && page.archivedFromParentPageId !== null
        ? page.archivedFromParentPageId
        : page.parentPageId,
    path: page.archivedFromPath !== undefined && page.archivedFromPath !== null ? page.archivedFromPath : page.path,
    archivedFromNotebookId: null,
    archivedFromParentPageId: null,
    archivedFromPath: null,
  });

  const pages: PagePatchOp[] = [
    { id: target.id, patch: archiveWithOrigin(target) },
    ...descendantsOf(allPages, target.id).map((sub) => ({ id: sub.id, patch: archiveWithOrigin(sub) })),
  ];

  return { intent: "archive", isRootPage: false, notebooks: [], pages };
}

async function applyArchivePlan(adapter: ArchiveHost, plan: ArchivePlan): Promise<void> {
  await adapter.assertPlan?.({ kind: "archive-plan", plan });
  for (const op of plan.notebooks) await adapter.updateNotebook(op.id, op.patch);
  for (const op of plan.pages) await adapter.updatePage(op.id, op.patch);
}

export async function unarchiveNotebookTree(
  adapter: ArchiveHost,
  allNotebooks: Notebook[],
  allPages: Page[],
  notebookId: string
): Promise<{ isRootPage: boolean }> {
  const plan = planUnarchiveNotebookTree(allNotebooks, allPages, notebookId);
  if (!plan) return { isRootPage: false };
  await applyArchivePlan(adapter, plan);
  return { isRootPage: plan.isRootPage };
}

export async function archiveNotebookTree(
  adapter: ArchiveHost,
  allNotebooks: Notebook[],
  allPages: Page[],
  notebookId: string
): Promise<{ isRootPage: boolean }> {
  const plan = planArchiveNotebookTree(allNotebooks, allPages, notebookId);
  if (!plan) return { isRootPage: false };
  await applyArchivePlan(adapter, plan);
  return { isRootPage: plan.isRootPage };
}

export async function unarchivePageTree(
  adapter: ArchiveHost,
  allPages: Page[],
  pageId: string
): Promise<void> {
  const plan = planUnarchivePageTree(allPages, pageId);
  if (plan) await applyArchivePlan(adapter, plan);
}

export async function archivePageTree(
  adapter: ArchiveHost,
  allPages: Page[],
  pageId: string
): Promise<void> {
  const plan = planArchivePageTree(allPages, pageId);
  if (plan) await applyArchivePlan(adapter, plan);
}
