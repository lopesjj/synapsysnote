
import assert from "node:assert/strict";
import {
  childrenOf,
  isNotebookDescendant,
  notebookAncestors,
  notebookSubtreeIds,
  parentIdOf,
} from "../src/lib/data/notebook-tree";
import type { Notebook } from "../src/types/models";

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

console.log("all notebook-tree checks passed");
