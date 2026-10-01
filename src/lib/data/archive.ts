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

  const isRootPage = !parentIdOf(target);
  const subTreeNotebooks = descendantNotebooks(allNotebooks, target.id);
  const allTreeNotebookIds = new Set([target.id, ...subTreeNotebooks.map((n) => n.id)]);

  if (isRootPage) {
    await adapter.updateNotebook(target.id, { archived: false });
  } else {
    await adapter.updateNotebook(target.id, { archived: false, parentId: null });
  }

  for (const nb of subTreeNotebooks) {
    await adapter.updateNotebook(nb.id, { archived: false });
  }

  const directPages = allPages.filter((p) => p.notebookId && allTreeNotebookIds.has(p.notebookId));
  const directPageIds = new Set(directPages.map((p) => p.id));
  const subpages = allPages.filter(
    (p) => !directPageIds.has(p.id) && p.path.some((ancestorId) => directPageIds.has(ancestorId))
  );

  const affectedPages = [...directPages, ...subpages];
  for (const page of affectedPages) {
    await adapter.updatePage(page.id, { archived: false });
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

  const descendants = descendantsOf(allPages, target.id);

  await adapter.updatePage(target.id, {
    archived: false,
    notebookId: null,
    parentPageId: null,
    path: [],
  });

  for (const sub of descendants) {
    const newPath = rebasePath(sub.path, target.id, []);
    await adapter.updatePage(sub.id, {
      archived: false,
      notebookId: null,
      path: newPath,
    });
  }
}
