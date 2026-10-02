import type { Notebook, Page } from "@/types/models";
import type { DataAdapter } from "./adapter";
import { descendantNotebooks, parentIdOf } from "./notebook-tree";
import { descendantsOf, rebasePath } from "./page-tree";

export async function unarchiveNotebookTree(
  adapter: Pick<DataAdapter, "updateNotebook" | "updatePage">,
  allNotebooks: Notebook[],
  allPages: Page[],
  notebookId: string
): Promise<{ isRootPage: boolean }> {
  const target = allNotebooks.find((n) => n.id === notebookId);
  if (!target) return { isRootPage: false };

  const isRootPage = !parentIdOf(target) && !target.archivedFromParentId;
  const subTreeNotebooks = descendantNotebooks(allNotebooks, target.id);
  const allTreeNotebookIds = new Set([target.id, ...subTreeNotebooks.map((n) => n.id)]);

  if (isRootPage) {
    await adapter.updateNotebook(target.id, { archived: false, archivedFromParentId: null });
    for (const nb of subTreeNotebooks) {
      if (nb.archivedFromParentId) {
        const validParent =
          allNotebooks.some((n) => n.id === nb.archivedFromParentId) ? nb.archivedFromParentId : null;
        await adapter.updateNotebook(nb.id, {
          archived: false,
          parentId: validParent,
          archivedFromParentId: null,
        });
      } else {
        await adapter.updateNotebook(nb.id, { archived: false });
      }
    }
  } else {
    const origParent = target.archivedFromParentId ?? parentIdOf(target);
    await adapter.updateNotebook(target.id, {
      archived: false,
      parentId: null,
      archivedFromParentId: origParent,
    });
    for (const nb of subTreeNotebooks) {
      if (nb.archivedFromParentId) {
        const validParent =
          allNotebooks.some((n) => n.id === nb.archivedFromParentId) ? nb.archivedFromParentId : null;
        await adapter.updateNotebook(nb.id, {
          archived: false,
          parentId: validParent,
          archivedFromParentId: null,
        });
      } else {
        await adapter.updateNotebook(nb.id, { archived: false });
      }
    }
  }

  const directPages = allPages.filter(
    (p) =>
      (p.notebookId && allTreeNotebookIds.has(p.notebookId)) ||
      (p.archivedFromNotebookId && allTreeNotebookIds.has(p.archivedFromNotebookId))
  );
  const directPageIds = new Set(directPages.map((p) => p.id));
  const subpages = allPages.filter((p) => {
    if (directPageIds.has(p.id)) return false;
    return directPages.some((dp) => descendantsOf(allPages, dp.id).some((sub) => sub.id === p.id));
  });

  const affectedPages = [...directPages, ...subpages];
  for (const page of affectedPages) {
    const restoreNotebook =
      page.archivedFromNotebookId !== undefined && page.archivedFromNotebookId !== null
        ? page.archivedFromNotebookId
        : page.notebookId;
    const restoreParentPage =
      page.archivedFromParentPageId !== undefined && page.archivedFromParentPageId !== null
        ? page.archivedFromParentPageId
        : page.parentPageId;
    const restorePath =
      page.archivedFromPath !== undefined && page.archivedFromPath !== null
        ? page.archivedFromPath
        : page.path;

    if (
      page.archivedFromNotebookId !== undefined ||
      page.archivedFromParentPageId !== undefined ||
      page.archivedFromPath !== undefined
    ) {
      await adapter.updatePage(page.id, {
        archived: false,
        notebookId: restoreNotebook,
        parentPageId: restoreParentPage,
        path: restorePath,
        archivedFromNotebookId: null,
        archivedFromParentPageId: null,
        archivedFromPath: null,
      });
    } else {
      await adapter.updatePage(page.id, { archived: false });
    }
  }

  return { isRootPage };
}

export async function archiveNotebookTree(
  adapter: Pick<DataAdapter, "updateNotebook" | "updatePage">,
  allNotebooks: Notebook[],
  allPages: Page[],
  notebookId: string
): Promise<{ isRootPage: boolean }> {
  const target = allNotebooks.find((n) => n.id === notebookId);
  if (!target) return { isRootPage: false };

  const isRootPage = !parentIdOf(target) && !target.archivedFromParentId;
  const restoreParent = target.archivedFromParentId;
  const validParent =
    restoreParent && allNotebooks.some((n) => n.id === restoreParent) ? restoreParent : null;

  if (target.archivedFromParentId !== undefined && target.archivedFromParentId !== null) {
    await adapter.updateNotebook(target.id, {
      archived: true,
      parentId: validParent,
      archivedFromParentId: null,
    });
  } else {
    await adapter.updateNotebook(target.id, { archived: true });
  }

  const subTreeNotebooks = descendantNotebooks(allNotebooks, target.id);
  for (const nb of subTreeNotebooks) {
    if (nb.archivedFromParentId !== undefined && nb.archivedFromParentId !== null) {
      const subValidParent = allNotebooks.some((n) => n.id === nb.archivedFromParentId)
        ? nb.archivedFromParentId
        : null;
      await adapter.updateNotebook(nb.id, {
        archived: true,
        parentId: subValidParent,
        archivedFromParentId: null,
      });
    } else {
      await adapter.updateNotebook(nb.id, { archived: true });
    }
  }

  const allTreeNotebookIds = new Set([target.id, ...subTreeNotebooks.map((n) => n.id)]);
  const directPages = allPages.filter(
    (p) =>
      (p.notebookId && allTreeNotebookIds.has(p.notebookId)) ||
      (p.archivedFromNotebookId && allTreeNotebookIds.has(p.archivedFromNotebookId))
  );
  const directPageIds = new Set(directPages.map((p) => p.id));
  const subpages = allPages.filter((p) => {
    if (directPageIds.has(p.id)) return false;
    return directPages.some((dp) => descendantsOf(allPages, dp.id).some((sub) => sub.id === p.id));
  });

  const affectedPages = [...directPages, ...subpages];
  for (const page of affectedPages) {
    const restoreNotebook =
      page.archivedFromNotebookId !== undefined && page.archivedFromNotebookId !== null
        ? page.archivedFromNotebookId
        : page.notebookId;
    const restoreParentPage =
      page.archivedFromParentPageId !== undefined && page.archivedFromParentPageId !== null
        ? page.archivedFromParentPageId
        : page.parentPageId;
    const restorePath =
      page.archivedFromPath !== undefined && page.archivedFromPath !== null
        ? page.archivedFromPath
        : page.path;

    if (
      page.archivedFromNotebookId !== undefined ||
      page.archivedFromParentPageId !== undefined ||
      page.archivedFromPath !== undefined
    ) {
      await adapter.updatePage(page.id, {
        archived: true,
        notebookId: restoreNotebook,
        parentPageId: restoreParentPage,
        path: restorePath,
        archivedFromNotebookId: null,
        archivedFromParentPageId: null,
        archivedFromPath: null,
      });
    } else {
      await adapter.updatePage(page.id, { archived: true });
    }
  }

  return { isRootPage };
}

export async function unarchivePageTree(
  adapter: Pick<DataAdapter, "updatePage">,
  allPages: Page[],
  pageId: string
): Promise<void> {
  const target = allPages.find((p) => p.id === pageId);
  if (!target) return;

  const origNotebook = target.archivedFromNotebookId ?? target.notebookId;
  const origParentPage = target.archivedFromParentPageId ?? target.parentPageId;
  const origPath = target.archivedFromPath ?? target.path;

  const descendants = descendantsOf(allPages, target.id);

  await adapter.updatePage(target.id, {
    archived: false,
    notebookId: null,
    parentPageId: null,
    path: [],
    archivedFromNotebookId: origNotebook,
    archivedFromParentPageId: origParentPage,
    archivedFromPath: origPath,
  });

  for (const sub of descendants) {
    const newPath = rebasePath(sub.path, target.id, []);
    const subOrigNotebook = sub.archivedFromNotebookId ?? sub.notebookId;
    const subOrigParentPage = sub.archivedFromParentPageId ?? sub.parentPageId;
    const subOrigPath = sub.archivedFromPath ?? sub.path;

    await adapter.updatePage(sub.id, {
      archived: false,
      notebookId: null,
      path: newPath,
      archivedFromNotebookId: subOrigNotebook,
      archivedFromParentPageId: subOrigParentPage,
      archivedFromPath: subOrigPath,
    });
  }
}

export async function archivePageTree(
  adapter: Pick<DataAdapter, "updatePage">,
  allPages: Page[],
  pageId: string
): Promise<void> {
  const target = allPages.find((p) => p.id === pageId);
  if (!target) return;

  const restoreNotebook =
    target.archivedFromNotebookId !== undefined && target.archivedFromNotebookId !== null
      ? target.archivedFromNotebookId
      : target.notebookId;
  const restoreParentPage =
    target.archivedFromParentPageId !== undefined && target.archivedFromParentPageId !== null
      ? target.archivedFromParentPageId
      : target.parentPageId;
  const restorePath =
    target.archivedFromPath !== undefined && target.archivedFromPath !== null
      ? target.archivedFromPath
      : target.path;

  await adapter.updatePage(target.id, {
    archived: true,
    notebookId: restoreNotebook,
    parentPageId: restoreParentPage,
    path: restorePath,
    archivedFromNotebookId: null,
    archivedFromParentPageId: null,
    archivedFromPath: null,
  });

  const descendants = descendantsOf(allPages, target.id);
  for (const sub of descendants) {
    const subRestoreNotebook =
      sub.archivedFromNotebookId !== undefined && sub.archivedFromNotebookId !== null
        ? sub.archivedFromNotebookId
        : sub.notebookId;
    const subRestoreParentPage =
      sub.archivedFromParentPageId !== undefined && sub.archivedFromParentPageId !== null
        ? sub.archivedFromParentPageId
        : sub.parentPageId;
    const subRestorePath =
      sub.archivedFromPath !== undefined && sub.archivedFromPath !== null
        ? sub.archivedFromPath
        : sub.path;

    await adapter.updatePage(sub.id, {
      archived: true,
      notebookId: subRestoreNotebook,
      parentPageId: subRestoreParentPage,
      path: subRestorePath,
      archivedFromNotebookId: null,
      archivedFromParentPageId: null,
      archivedFromPath: null,
    });
  }
}
