export interface PartitionNotebook {
  id: string;
  parentId?: string | null;
  archived?: boolean;
  deletedAt?: number | null;
}

export interface PartitionPage {
  id: string;
  notebookId: string | null;
  parentPageId: string | null;
  archived?: boolean;
  deletedAt?: number | null;
}

export interface WorkspacePartition<N extends PartitionNotebook, P extends PartitionPage> {
  liveNotebooks: N[];
  archivedNotebooks: N[];
  livePages: P[];
  archivedPages: P[];
  archivedNotebookIds: Set<string>;
  archivedPageIds: Set<string>;
}

export function partitionWorkspace<N extends PartitionNotebook, P extends PartitionPage>(
  notebooks: N[],
  pages: P[]
): WorkspacePartition<N, P> {
  const nonTrashedNotebooks = notebooks.filter((notebook) => !notebook.deletedAt);
  const nonTrashedPages = pages.filter((page) => !page.deletedAt);

  const archivedNotebookIds = new Set<string>();
  for (const notebook of nonTrashedNotebooks) {
    if (notebook.archived) archivedNotebookIds.add(notebook.id);
  }
  let notebookAdded = true;
  while (notebookAdded) {
    notebookAdded = false;
    for (const notebook of nonTrashedNotebooks) {
      if (
        !archivedNotebookIds.has(notebook.id) &&
        notebook.parentId &&
        archivedNotebookIds.has(notebook.parentId)
      ) {
        archivedNotebookIds.add(notebook.id);
        notebookAdded = true;
      }
    }
  }

  const archivedPageIds = new Set<string>();
  for (const page of nonTrashedPages) {
    if (page.archived || (page.notebookId && archivedNotebookIds.has(page.notebookId))) {
      archivedPageIds.add(page.id);
    }
  }
  let pageAdded = true;
  while (pageAdded) {
    pageAdded = false;
    for (const page of nonTrashedPages) {
      if (!archivedPageIds.has(page.id) && page.parentPageId && archivedPageIds.has(page.parentPageId)) {
        archivedPageIds.add(page.id);
        pageAdded = true;
      }
    }
  }

  return {
    liveNotebooks: nonTrashedNotebooks.filter((notebook) => !archivedNotebookIds.has(notebook.id)),
    archivedNotebooks: nonTrashedNotebooks.filter((notebook) => archivedNotebookIds.has(notebook.id)),
    livePages: nonTrashedPages.filter((page) => !archivedPageIds.has(page.id)),
    archivedPages: nonTrashedPages.filter((page) => archivedPageIds.has(page.id)),
    archivedNotebookIds,
    archivedPageIds,
  };
}
