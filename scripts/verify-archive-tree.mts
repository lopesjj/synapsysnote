import assert from "node:assert/strict";
import {
  unarchiveNotebookTree,
  unarchivePageTree,
  archiveNotebookTree,
  archivePageTree,
} from "../src/lib/data/archive";
import type { Notebook, Page } from "../src/types/models";

function makeNotebook(
  id: string,
  parentId: string | null = null,
  archived = true,
  archivedFromParentId: string | null = null
): Notebook {
  return {
    id,
    name: id,
    parentId,
    archivedFromParentId,
    order: 0,
    archived,
    createdAt: 0,
    updatedAt: 0,
  };
}

function makePage(
  id: string,
  notebookId: string | null,
  parentPageId: string | null = null,
  path: string[] = [],
  archived = true,
  archivedFrom?: {
    notebookId?: string | null;
    parentPageId?: string | null;
    path?: string[] | null;
  }
): Page {
  return {
    id,
    title: id,
    notebookId,
    parentPageId,
    path,
    archivedFromNotebookId: archivedFrom?.notebookId ?? null,
    archivedFromParentPageId: archivedFrom?.parentPageId ?? null,
    archivedFromPath: archivedFrom?.path ?? null,
    blocks: [],
    plainText: "",
    transcriptText: "",
    tags: [],
    outgoingLinks: [],
    backlinks: [],
    favorite: false,
    archived,
    deletedAt: null,
    createdBy: "user",
    updatedBy: "user",
    createdAt: 0,
    updatedAt: 0,
    order: 0,
  };
}

async function runTests() {
  {
    const pageA = makeNotebook("page-a", null, true);
    const cadB = makeNotebook("cad-b", "page-a", true);
    const subCadC = makeNotebook("cad-c", "cad-b", true);
    const note1 = makePage("note-1", "page-a", null, [], true);
    const note2 = makePage("note-2", "cad-b", null, [], true);
    const subnote2 = makePage("sub-2", "cad-b", "note-2", ["note-2"], true);
    const unrelatedNote = makePage("unrelated", "other", null, [], true);

    const notebooks = [pageA, cadB, subCadC];
    const pages = [note1, note2, subnote2, unrelatedNote];

    const updatedNotebooks: Record<string, Partial<Notebook>> = {};
    const updatedPages: Record<string, Partial<Page>> = {};

    const mockAdapter = {
      updateNotebook: async (id: string, patch: Partial<Notebook>) => {
        updatedNotebooks[id] = { ...(updatedNotebooks[id] || {}), ...patch };
      },
      updatePage: async (id: string, patch: Partial<Page>) => {
        updatedPages[id] = { ...(updatedPages[id] || {}), ...patch };
      },
    };

    const res = await unarchiveNotebookTree(mockAdapter, notebooks, pages, "page-a");
    assert.equal(res.isRootPage, true);
    assert.equal(updatedNotebooks["page-a"]?.archived, false);
    assert.equal(updatedNotebooks["cad-b"]?.archived, false);
    assert.equal(updatedNotebooks["cad-c"]?.archived, false);
    assert.equal(updatedNotebooks["cad-b"]?.parentId, undefined);
    assert.equal(updatedPages["note-1"]?.archived, false);
    assert.equal(updatedPages["note-2"]?.archived, false);
    assert.equal(updatedPages["sub-2"]?.archived, false);
    assert.equal(updatedPages["unrelated"], undefined);
  }

  {
    const pageA = makeNotebook("page-a", null, true);
    const cadB = makeNotebook("cad-b", "page-a", true);
    const subCadC = makeNotebook("cad-c", "cad-b", true);
    const note2 = makePage("note-2", "cad-b", null, [], true);
    const subnote2 = makePage("sub-2", "cad-b", "note-2", ["note-2"], true);
    const note1 = makePage("note-1", "page-a", null, [], true);

    const notebooks = [pageA, cadB, subCadC];
    const pages = [note1, note2, subnote2];

    const updatedNotebooks: Record<string, Partial<Notebook>> = {};
    const updatedPages: Record<string, Partial<Page>> = {};

    const mockAdapter = {
      updateNotebook: async (id: string, patch: Partial<Notebook>) => {
        updatedNotebooks[id] = { ...(updatedNotebooks[id] || {}), ...patch };
      },
      updatePage: async (id: string, patch: Partial<Page>) => {
        updatedPages[id] = { ...(updatedPages[id] || {}), ...patch };
      },
    };

    const res = await unarchiveNotebookTree(mockAdapter, notebooks, pages, "cad-b");
    assert.equal(res.isRootPage, false);
    assert.equal(updatedNotebooks["cad-b"]?.archived, false);
    assert.equal(updatedNotebooks["cad-b"]?.parentId, null);
    assert.equal(updatedNotebooks["cad-b"]?.archivedFromParentId, "page-a");
    assert.equal(updatedNotebooks["cad-c"]?.archived, false);
    assert.equal(updatedNotebooks["page-a"], undefined);
    assert.equal(updatedPages["note-2"]?.archived, false);
    assert.equal(updatedPages["sub-2"]?.archived, false);
    assert.equal(updatedPages["note-1"], undefined);
  }

  {
    const note1 = makePage("note-1", "cad-b", "parent-note", ["parent-note"], true);
    const subnote1 = makePage("sub-1", "cad-b", "note-1", ["parent-note", "note-1"], true);
    const deepSub = makePage("deep", "cad-b", "sub-1", ["parent-note", "note-1", "sub-1"], true);
    const otherNote = makePage("other", "cad-b", null, [], true);

    const pages = [note1, subnote1, deepSub, otherNote];
    const updatedPages: Record<string, Partial<Page>> = {};

    const mockAdapter = {
      updatePage: async (id: string, patch: Partial<Page>) => {
        updatedPages[id] = { ...(updatedPages[id] || {}), ...patch };
      },
    };

    await unarchivePageTree(mockAdapter, pages, "note-1");
    assert.deepEqual(updatedPages["note-1"], {
      archived: false,
      notebookId: null,
      parentPageId: null,
      path: [],
      archivedFromNotebookId: "cad-b",
      archivedFromParentPageId: "parent-note",
      archivedFromPath: ["parent-note"],
    });
    assert.deepEqual(updatedPages["sub-1"], {
      archived: false,
      notebookId: null,
      path: ["note-1"],
      archivedFromNotebookId: "cad-b",
      archivedFromParentPageId: "note-1",
      archivedFromPath: ["parent-note", "note-1"],
    });
    assert.deepEqual(updatedPages["deep"], {
      archived: false,
      notebookId: null,
      path: ["note-1", "sub-1"],
      archivedFromNotebookId: "cad-b",
      archivedFromParentPageId: "sub-1",
      archivedFromPath: ["parent-note", "note-1", "sub-1"],
    });
    assert.equal(updatedPages["other"], undefined);
  }

  {
    const pageA = makeNotebook("page-a", null, false);
    const cadB = makeNotebook("cad-b", null, false, "page-a");
    const subCadC = makeNotebook("cad-c", "cad-b", false);
    const noteInCad = makePage("note-in-cad", "cad-b", null, [], false);

    const notebooks = [pageA, cadB, subCadC];
    const pages = [noteInCad];

    const updatedNotebooks: Record<string, Partial<Notebook>> = {};
    const updatedPages: Record<string, Partial<Page>> = {};

    const mockAdapter = {
      updateNotebook: async (id: string, patch: Partial<Notebook>) => {
        updatedNotebooks[id] = { ...(updatedNotebooks[id] || {}), ...patch };
      },
      updatePage: async (id: string, patch: Partial<Page>) => {
        updatedPages[id] = { ...(updatedPages[id] || {}), ...patch };
      },
    };

    const res = await archiveNotebookTree(mockAdapter, notebooks, pages, "cad-b");
    assert.equal(res.isRootPage, false);
    assert.equal(updatedNotebooks["cad-b"]?.archived, true);
    assert.equal(updatedNotebooks["cad-b"]?.parentId, "page-a");
    assert.equal(updatedNotebooks["cad-b"]?.archivedFromParentId, null);
    assert.equal(updatedNotebooks["cad-c"]?.archived, true);
    assert.equal(updatedPages["note-in-cad"]?.archived, true);
  }

  {
    const pageA = makeNotebook("page-a", null, false);
    const cadB = makeNotebook("cad-b", null, false, "page-a");
    const noteUnfiled = makePage(
      "note-unfiled",
      null,
      null,
      [],
      false,
      { notebookId: "cad-b", parentPageId: null, path: [] }
    );

    const notebooks = [pageA, cadB];
    const pages = [noteUnfiled];

    const updatedNotebooks: Record<string, Partial<Notebook>> = {};
    const updatedPages: Record<string, Partial<Page>> = {};

    const mockAdapter = {
      updateNotebook: async (id: string, patch: Partial<Notebook>) => {
        updatedNotebooks[id] = { ...(updatedNotebooks[id] || {}), ...patch };
      },
      updatePage: async (id: string, patch: Partial<Page>) => {
        updatedPages[id] = { ...(updatedPages[id] || {}), ...patch };
      },
    };

    const res = await archiveNotebookTree(mockAdapter, notebooks, pages, "page-a");
    assert.equal(res.isRootPage, true);
    assert.equal(updatedNotebooks["page-a"]?.archived, true);
    assert.equal(updatedNotebooks["cad-b"]?.archived, true);
    assert.equal(updatedNotebooks["cad-b"]?.parentId, "page-a");
    assert.equal(updatedNotebooks["cad-b"]?.archivedFromParentId, null);
    assert.equal(updatedPages["note-unfiled"]?.archived, true);
    assert.equal(updatedPages["note-unfiled"]?.notebookId, "cad-b");
    assert.equal(updatedPages["note-unfiled"]?.archivedFromNotebookId, null);
  }

  {
    const note1 = makePage("note-1", null, null, [], false, {
      notebookId: "cad-b",
      parentPageId: "parent-note",
      path: ["parent-note"],
    });
    const sub1 = makePage("sub-1", null, "note-1", ["note-1"], false, {
      notebookId: "cad-b",
      parentPageId: "note-1",
      path: ["parent-note", "note-1"],
    });

    const pages = [note1, sub1];
    const updatedPages: Record<string, Partial<Page>> = {};

    const mockAdapter = {
      updatePage: async (id: string, patch: Partial<Page>) => {
        updatedPages[id] = { ...(updatedPages[id] || {}), ...patch };
      },
    };

    await archivePageTree(mockAdapter, pages, "note-1");
    assert.deepEqual(updatedPages["note-1"], {
      archived: true,
      notebookId: "cad-b",
      parentPageId: "parent-note",
      path: ["parent-note"],
      archivedFromNotebookId: null,
      archivedFromParentPageId: null,
      archivedFromPath: null,
    });
    assert.deepEqual(updatedPages["sub-1"], {
      archived: true,
      notebookId: "cad-b",
      parentPageId: "note-1",
      path: ["parent-note", "note-1"],
      archivedFromNotebookId: null,
      archivedFromParentPageId: null,
      archivedFromPath: null,
    });
  }

  console.log("All archive tree cascade verification tests passed successfully!");
}

runTests();
