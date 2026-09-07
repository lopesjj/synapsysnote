
import assert from "node:assert/strict";
import { rebasePath } from "../src/lib/data/page-tree";
import { LocalAdapter } from "../src/lib/data/local-adapter";
import type { Notebook, Page } from "../src/types/models";


assert.deepEqual(
  rebasePath(["root", "mid", "moved", "child"], "moved", ["newRoot"]),
  ["newRoot", "moved", "child"],
  "ancestors above the moved page are replaced, descendants below preserved"
);
assert.deepEqual(
  rebasePath(["a", "moved"], "moved", []),
  ["moved"],
  "moving to the top level leaves only the moved page as ancestor"
);
assert.deepEqual(
  rebasePath(["a", "b"], "moved", ["x"]),
  ["a", "b"],
  "a path that does not contain the moved page is untouched"
);
console.log("  rebasePath: prefix replaced, suffix preserved, unrelated untouched");


function installBrowserStubs() {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  };
  Object.assign(globalThis, {
    window: { localStorage, addEventListener() {}, removeEventListener() {}, dispatchEvent() {} },
    localStorage,
  });
}

installBrowserStubs();

async function main() {
  const adapter = new LocalAdapter();
  let pages: Page[] = [];
  const stop = adapter.subscribePages((next) => {
    pages = next;
  });

  const source = await adapter.createNotebook({ name: "Origem" });
  const destination = await adapter.createNotebook({ name: "Destino" });

  const parent = await adapter.createPage({ notebookId: source.id, title: "Pai" });
  const child = await adapter.createPage({
    notebookId: source.id,
    parentPageId: parent.id,
    title: "Filho",
  });
  const grandchild = await adapter.createPage({
    notebookId: source.id,
    parentPageId: child.id,
    title: "Neto",
  });

  const find = (id: string) => pages.find((page) => page.id === id)!;

  assert.deepEqual(find(grandchild.id).path, [parent.id, child.id], "path is materialised on create");

  await adapter.movePage(parent.id, { notebookId: destination.id, parentPageId: null });

  assert.equal(find(parent.id).notebookId, destination.id, "the moved page changes notebook");
  assert.equal(
    find(child.id).notebookId,
    destination.id,
    "a child follows its parent into the new notebook"
  );
  assert.equal(
    find(grandchild.id).notebookId,
    destination.id,
    "a grandchild follows too — the whole subtree moves"
  );
  assert.deepEqual(find(child.id).path, [parent.id], "the child's path is rebased");
  assert.deepEqual(
    find(grandchild.id).path,
    [parent.id, child.id],
    "the grandchild keeps its position within the subtree"
  );
  assert.equal(find(child.id).parentPageId, parent.id, "parent links are untouched by the move");
  console.log("  movePage: the subtree follows, paths rebased, parent links intact");

  await adapter.movePage(grandchild.id, { parentPageId: parent.id });

  assert.equal(
    find(grandchild.id).notebookId,
    destination.id,
    "an omitted notebookId keeps the current notebook instead of erasing it"
  );
  assert.deepEqual(find(grandchild.id).path, [parent.id], "re-parenting rebases the path");
  console.log("  movePage: an omitted notebookId is preserved, not cleared");

  const cascadeRoot = await adapter.createNotebook({ name: "Raiz cascade" });
  const cascadeChild = await adapter.createNotebook({
    name: "Caderno cascade",
    parentId: cascadeRoot.id,
  });
  const cascadeNote = await adapter.createPage({
    notebookId: cascadeChild.id,
    title: "Nota cascade",
  });
  const cascadeNestedNote = await adapter.createPage({
    notebookId: cascadeChild.id,
    parentPageId: cascadeNote.id,
    title: "Filha cascade",
  });

  let notebooks: Notebook[] = [];
  const stopNotebooks = adapter.subscribeNotebooks((next) => {
    notebooks = next;
  });

  await adapter.deleteNotebook(cascadeRoot.id);

  assert.equal(
    notebooks.some((notebook) => notebook.id === cascadeRoot.id || notebook.id === cascadeChild.id),
    false,
    "the notebook and its nested cadernos are removed"
  );
  assert.ok(find(cascadeNote.id).deletedAt, "notes inside the tree go to the trash");
  assert.ok(find(cascadeNestedNote.id).deletedAt, "nested notes go to the trash too");
  assert.equal(find(cascadeNote.id).notebookId, null, "trashed notes detach from the deleted notebook");

  await adapter.restorePage(cascadeNote.id);
  assert.equal(find(cascadeNote.id).deletedAt, null, "restore clears the parent note");
  assert.equal(find(cascadeNestedNote.id).deletedAt, null, "restore also brings the subtree back");

  stopNotebooks();
  stop();
  console.log("all page tree checks passed");
}

await main();
