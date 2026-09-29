import assert from "node:assert/strict";
import {
  isRestorableBackup,
  normalizeWorkspaceBackup,
  summarizeWorkspaceBackup,
} from "../src/lib/import/workspace-backup";

const file = { storagePath: "workspaces/ws_a/files/a.png", archivePath: "files/a.png", name: "a.png", mimeType: "image/png" };

const rootFormat = normalizeWorkspaceBackup({
  workspace: { id: "ws_a", name: "Pessoal" },
  notebooks: [{ id: "nb1" }],
  pages: [{ id: "p1" }, { id: "p2" }, "lixo"],
  databases: [{ id: "db1", rows: [{ id: "r1" }, { id: "r2" }] }, { id: "db2" }],
  flashcards: [{ id: "f1" }],
  files: [file, { storagePath: 3 }],
  study: { study_plans: [{ id: "plan" }], study_meta: "invalido" },
});
assert.ok(isRestorableBackup(rootFormat));
assert.equal(rootFormat.pages.length, 2);
assert.equal(rootFormat.files.length, 1);
assert.deepEqual(rootFormat.study?.study_plans, [{ id: "plan" }]);
assert.deepEqual(rootFormat.study?.study_meta, []);
assert.deepEqual(summarizeWorkspaceBackup(rootFormat), {
  workspaceName: "Pessoal",
  notebooksCount: 1,
  pagesCount: 2,
  databasesCount: 2,
  databaseRowsCount: 2,
  flashcardsCount: 1,
  filesCount: 1,
});

const accountFormat = normalizeWorkspaceBackup({
  account: { uid: "u" },
  workspaces: [
    { workspace: { name: "Vazio" }, pages: [] },
    { workspace: { name: "Principal" }, pages: [{ id: "p1" }], study: { study_sessions: [{ id: "s1" }] } },
  ],
  files: [file],
});
assert.ok(isRestorableBackup(accountFormat));
assert.equal(accountFormat.workspace?.name, "Principal");
assert.equal(accountFormat.files.length, 1);
assert.deepEqual(accountFormat.study?.study_sessions, [{ id: "s1" }]);

const both = normalizeWorkspaceBackup({
  pages: [{ id: "raiz" }],
  workspaces: [{ pages: [{ id: "aninhado" }] }],
});
assert.equal(both?.pages[0].id, "raiz");

assert.equal(isRestorableBackup(normalizeWorkspaceBackup({ pages: [] })), false);
assert.equal(normalizeWorkspaceBackup(null), null);
assert.equal(normalizeWorkspaceBackup([1, 2]), null);

console.log("verify-workspace-backup: ok");
