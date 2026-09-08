import assert from "node:assert/strict";
import {
  shouldImportAsNotebook,
  resolveImportPlacement,
  resolveNotebookParentId,
  countChildPageBlocks,
  type ImportRole,
} from "../src/lib/notion/classify-import";

const rootPageId = "notion_root_sptc";
const dbContabilidadeId = "notion_db_contabilidade";
const dbBiologiaId = "notion_db_biologia";
const pageAula24Id = "notion_page_aula_24";
const pageAula23Id = "notion_page_aula_23";

const parents = new Map<string, string | null>([
  [rootPageId, null],
  [dbContabilidadeId, rootPageId],
  [dbBiologiaId, rootPageId],
  [pageAula24Id, dbContabilidadeId],
  [pageAula23Id, dbContabilidadeId],
]);

assert.equal(
  shouldImportAsNotebook({
    childCount: 2,
    notionBlocks: [
      { type: "child_database", id: "b1", child_database: { title: "SPTC Perito - Contabilidade" } },
      { type: "link_to_page", id: "b2", link_to_page: { database_id: dbBiologiaId } },
    ],
  }),
  true
);

assert.equal(
  shouldImportAsNotebook({
    childCount: 24,
    isDatabase: true,
  }),
  true
);

assert.equal(
  shouldImportAsNotebook({
    childCount: 0,
    isDatabase: true,
  }),
  false
);

const roles = new Map<string, ImportRole>([
  [rootPageId, "notebook"],
  [dbContabilidadeId, "notebook"],
  [dbBiologiaId, "notebook"],
  [pageAula24Id, "page"],
  [pageAula23Id, "page"],
]);

const idMap = new Map<string, string>([
  [rootPageId, "nb_root_sptc"],
  [dbContabilidadeId, "nb_contabilidade"],
  [dbBiologiaId, "nb_biologia"],
]);

const contabilidadeParent = resolveNotebookParentId({
  notionId: dbContabilidadeId,
  parents,
  roles,
  idMap,
});
assert.equal(contabilidadeParent, "nb_root_sptc");

const aula24Placement = resolveImportPlacement({
  notionId: pageAula24Id,
  parents,
  roles,
  idMap,
  fallbackNotebookId: null,
  preserveHierarchy: true,
});

assert.equal(aula24Placement.notebookId, "nb_contabilidade");
assert.equal(aula24Placement.parentPageId, null);

const aula23Placement = resolveImportPlacement({
  notionId: pageAula23Id,
  parents,
  roles,
  idMap,
  fallbackNotebookId: null,
  preserveHierarchy: true,
});

assert.equal(aula23Placement.notebookId, "nb_contabilidade");
assert.equal(aula23Placement.parentPageId, null);

const countBlocks = countChildPageBlocks([
  { type: "child_page" },
  { type: "child_database" },
  { type: "link_to_page" },
  { type: "link_to_database" },
  { type: "paragraph" },
]);
assert.equal(countBlocks, 4);

console.log("all notion database to notebook hierarchy checks passed");
