
import assert from "node:assert/strict";
import {
  childrenOf,
  isNotebookDescendant,
  notebookAncestors,
  notebookSubtreeIds,
  parentIdOf,
} from "../src/lib/data/notebook-tree";
import { sortNotebooks, sortPageTree, sortPages } from "../src/lib/data/list-sort";
import type { Notebook, Page } from "../src/types/models";
import type { PageTreeNode } from "../src/lib/data/provider";

function notebook(id: string, parentId: string | null = null, order = 0): Notebook {
  return { id, name: id, parentId, order, createdAt: 0, updatedAt: 0 };
}

const tree = [
  notebook("root-a", null, 0),
  notebook("root-b", null, 100),
  notebook("child", "root-a", 0),
  notebook("grand", "child", 0),
];

assert.equal(parentIdOf({}), null);
assert.equal(parentIdOf({ parentId: undefined }), null);
assert.equal(parentIdOf({ parentId: "" }), null);
assert.equal(parentIdOf({ parentId: "null" }), null);
assert.deepEqual(
  childrenOf(tree, null).map((item) => item.id),
  ["root-a", "root-b"]
);
assert.deepEqual(
  childrenOf(tree, "root-a").map((item) => item.id),
  ["child"]
);
assert.deepEqual(
  notebookAncestors(tree, "grand").map((item) => item.id),
  ["root-a", "child", "grand"]
);
assert.equal(isNotebookDescendant(tree, "grand", "root-a"), true);
assert.equal(isNotebookDescendant(tree, "root-b", "root-a"), false);
assert.equal(isNotebookDescendant(tree, "root-a", "root-a"), false);
assert.deepEqual(notebookSubtreeIds(tree, "root-a"), ["root-a", "child", "grand"]);
assert.deepEqual(notebookSubtreeIds(tree, "root-b"), ["root-b"]);

function page(id: string, title: string, order: number, createdAt: number, updatedAt: number): Page {
  return {
    id,
    title,
    notebookId: "nb",
    parentPageId: null,
    path: [],
    blocks: [],
    plainText: "",
    transcriptText: "",
    tags: [],
    outgoingLinks: [],
    backlinks: [],
    favorite: false,
    archived: false,
    deletedAt: null,
    createdBy: "u",
    updatedBy: "u",
    createdAt,
    updatedAt,
    order,
  };
}

const sortableNotebooks: Notebook[] = [
  { id: "c", name: "Cadernos 10", parentId: null, order: 0, createdAt: 300, updatedAt: 100 },
  { id: "a", name: "Cadernos 2", parentId: null, order: 1, createdAt: 100, updatedAt: 300 },
  { id: "b", name: "Álgebra", parentId: null, order: 2, createdAt: 200, updatedAt: 200 },
];

assert.deepEqual(
  sortNotebooks(sortableNotebooks, "manual", "asc").map((item) => item.id),
  ["c", "a", "b"]
);
assert.deepEqual(
  sortNotebooks(sortableNotebooks, "manual", "desc").map((item) => item.id),
  ["c", "a", "b"]
);
assert.deepEqual(
  sortNotebooks(sortableNotebooks, "name", "asc").map((item) => item.id),
  ["b", "a", "c"]
);
assert.deepEqual(
  sortNotebooks(sortableNotebooks, "name", "desc").map((item) => item.id),
  ["c", "a", "b"]
);
assert.deepEqual(
  sortNotebooks(sortableNotebooks, "updated", "desc").map((item) => item.id),
  ["a", "b", "c"]
);
assert.deepEqual(
  sortNotebooks(sortableNotebooks, "created", "asc").map((item) => item.id),
  ["a", "b", "c"]
);

const sortablePages: Page[] = [
  page("p3", "Aula 10", 0, 300, 100),
  page("p1", "Aula 2", 1, 100, 300),
  page("p2", "Aula 3", 2, 200, 200),
];

assert.deepEqual(
  sortPages(sortablePages, "manual", "asc").map((item) => item.id),
  ["p3", "p1", "p2"]
);
assert.deepEqual(
  sortPages(sortablePages, "name", "asc").map((item) => item.id),
  ["p1", "p2", "p3"]
);
assert.deepEqual(
  sortPages(sortablePages, "updated", "desc").map((item) => item.id),
  ["p1", "p2", "p3"]
);

const treeNodes: PageTreeNode[] = [
  {
    page: page("root-2", "Beta", 1, 200, 200),
    depth: 0,
    children: [
      { page: page("kid-a", "Zulu", 0, 100, 100), depth: 1, children: [] },
      { page: page("kid-b", "Alfa", 1, 200, 200), depth: 1, children: [] },
    ],
  },
  { page: page("root-1", "Alfa", 0, 100, 100), depth: 0, children: [] },
];

const childrenOfRoot2 = (nodes: PageTreeNode[]) =>
  nodes.find((node) => node.page.id === "root-2")!.children.map((node) => node.page.id);

assert.deepEqual(
  sortPageTree(treeNodes, "manual", "asc").map((node) => node.page.id),
  ["root-1", "root-2"]
);
assert.deepEqual(
  sortPageTree(treeNodes, "name", "asc").map((node) => node.page.id),
  ["root-1", "root-2"]
);
assert.deepEqual(childrenOfRoot2(sortPageTree(treeNodes, "name", "asc")), ["kid-b", "kid-a"]);
assert.deepEqual(childrenOfRoot2(sortPageTree(treeNodes, "manual", "asc")), ["kid-a", "kid-b"]);
assert.deepEqual(
  childrenOfRoot2(sortPageTree(treeNodes, "manual", "asc", "name", "asc")),
  ["kid-b", "kid-a"]
);
assert.deepEqual(
  sortPageTree(treeNodes, "manual", "asc", "name", "asc").map((node) => node.page.id),
  ["root-1", "root-2"]
);
assert.deepEqual(
  childrenOfRoot2(sortPageTree(treeNodes, "name", "asc", "manual", "asc")),
  ["kid-a", "kid-b"]
);
assert.deepEqual(
  sortPageTree(treeNodes, "name", "desc").map((node) => node.page.id),
  ["root-2", "root-1"]
);
assert.deepEqual(
  treeNodes.map((node) => node.page.id),
  ["root-2", "root-1"]
);
assert.deepEqual(childrenOfRoot2(treeNodes), ["kid-a", "kid-b"]);

console.log("all notebook-tree checks passed");
