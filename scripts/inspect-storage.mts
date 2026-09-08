import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";
import { getFirestore } from "firebase-admin/firestore";
import * as fs from "node:fs";
import * as path from "node:path";

const keyPath = path.resolve(process.cwd(), "synapsysnote-firebase-adminsdk-fbsvc-dee68a0f58.json");
const serviceAccount = JSON.parse(fs.readFileSync(keyPath, "utf-8"));

const app = getApps().length
  ? getApps()[0]
  : initializeApp({
      credential: cert(serviceAccount),
      storageBucket: "synapsysnote.firebasestorage.app",
      projectId: serviceAccount.project_id || "synapsysnote",
    });

const bucket = getStorage(app).bucket();
const db = getFirestore(app);

async function main() {
  console.log("=== INSPEÇÃO DO STORAGE E FIRESTORE ===");
  
  // 1. Listar arquivos no Storage
  console.log("Buscando arquivos no bucket:", bucket.name);
  const [files] = await bucket.getFiles();
  console.log(`Total de arquivos no storage: ${files.length}`);
  for (const f of files) {
    console.log(` - File: ${f.name} (size: ${f.metadata.size} bytes, type: ${f.metadata.contentType}, updated: ${f.metadata.updated})`);
  }

  // 2. Listar Workspaces no Firestore
  const wsSnap = await db.collection("workspaces").get();
  console.log(`\nTotal de workspaces no Firestore: ${wsSnap.size}`);
  for (const ws of wsSnap.docs) {
    console.log(` Workspace: ${ws.id}, name: ${ws.data().name}`);
    const pagesSnap = await ws.ref.collection("pages").get();
    console.log(`   Páginas (${pagesSnap.size}):`);
    for (const p of pagesSnap.docs) {
      const data = p.data();
      console.log(`     - [${p.id}] "${data.title}" (deletedAt: ${data.deletedAt ? 'SIM' : 'NÃO'}, parent: ${data.parentPageId || 'root'}, notebook: ${data.notebookId || 'none'})`);
    }

    const dbSnap = await ws.ref.collection("databases").get();
    console.log(`   Databases (${dbSnap.size}):`);
    for (const d of dbSnap.docs) {
      const data = d.data();
      console.log(`     - [${d.id}] "${data.name}" (deletedAt: ${data.deletedAt ? 'SIM' : 'NÃO'})`);
    }
  }
}

main().catch((err) => {
  console.error("Erro na inspeção:", err);
  process.exit(1);
});
