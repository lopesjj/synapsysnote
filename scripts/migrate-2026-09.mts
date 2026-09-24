import { FieldValue } from "firebase-admin/firestore";
import { adminDb, isAdminConfigured } from "../src/lib/firebase/admin";
import { relinkImportedPages } from "../src/lib/notion/server/run-import";

const confirm = process.argv.includes("--confirm");
const BATCH_LIMIT = 400;

async function commitAll(ops: Array<(batch: FirebaseFirestore.WriteBatch) => void>) {
  const db = adminDb();
  for (let start = 0; start < ops.length; start += BATCH_LIMIT) {
    const batch = db.batch();
    for (const op of ops.slice(start, start + BATCH_LIMIT)) op(batch);
    await batch.commit();
  }
}

async function dropNativeBlocks(group: "pages" | "versions") {
  const snap = await adminDb().collectionGroup(group).select("blocks", "blocksJson").get();
  const ops: Array<(batch: FirebaseFirestore.WriteBatch) => void> = [];
  let rebuilt = 0;
  for (const doc of snap.docs) {
    const blocks = doc.get("blocks");
    if (!Array.isArray(blocks)) continue;
    const hasJson = typeof doc.get("blocksJson") === "string";
    if (!hasJson) rebuilt += 1;
    ops.push((batch) =>
      batch.update(doc.ref, {
        ...(hasJson ? {} : { blocksJson: JSON.stringify(blocks) }),
        blocks: FieldValue.delete(),
      })
    );
  }
  console.log(`${group}: ${ops.length} documento(s) com o campo blocks duplicado (${rebuilt} sem blocksJson, que será criado)`);
  if (confirm) await commitAll(ops);
}

async function dropAttachments() {
  const snap = await adminDb().collectionGroup("attachments").select().get();
  console.log(`attachments: ${snap.size} documento(s) sem uso a remover`);
  if (confirm) await commitAll(snap.docs.map((doc) => (batch) => batch.delete(doc.ref)));
}

async function moveImportTrees() {
  const snap = await adminDb().collectionGroup("import_jobs").get();
  const legacy = snap.docs.filter((doc) => doc.get("treeMetadata"));
  const finished = new Set(["completed", "completed_with_errors", "failed", "canceled"]);
  console.log(`import_jobs: ${legacy.length} job(s) com a árvore no documento principal`);
  if (!confirm) return;
  for (const doc of legacy) {
    if (!finished.has(String(doc.get("status")))) {
      await doc.ref.collection("meta").doc("tree").set(doc.get("treeMetadata"));
    }
    await doc.ref.update({ treeMetadata: FieldValue.delete() });
  }
}

async function relinkNotionMentions() {
  const workspaces = await adminDb().collection("workspaces").select().get();
  let pages = 0;
  for (const workspace of workspaces.docs) {
    pages += await relinkImportedPages(workspace.id, new Map(), true, confirm);
  }
  console.log(`pages: ${pages} nota(s) importada(s) com menção ao id do Notion ou links a recalcular`);
}

async function main() {
  if (!isAdminConfigured()) {
    console.error("Erro: Firebase Admin não configurado no ambiente local.");
    process.exit(1);
  }
  console.log(confirm ? "Aplicando migração…" : "[SIMULAÇÃO] Nada será gravado. Use --confirm para aplicar.");
  await dropNativeBlocks("pages");
  await dropNativeBlocks("versions");
  await dropAttachments();
  await moveImportTrees();
  await relinkNotionMentions();
  console.log(confirm ? "Migração concluída." : "Fim da simulação.");
}

main().catch((error) => {
  console.error("Erro na migração:", error);
  process.exit(1);
});
