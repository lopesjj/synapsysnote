import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as fs from "node:fs";
import * as path from "node:path";

const keyPath = path.resolve(process.cwd(), "synapsysnote-firebase-adminsdk-fbsvc-dee68a0f58.json");
const serviceAccount = JSON.parse(fs.readFileSync(keyPath, "utf-8"));

const app = getApps().length
  ? getApps()[0]
  : initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.project_id || "synapsysnote",
    });

const db = getFirestore(app);

async function checkPageConsistency() {
  console.log("=== VERIFICANDO CONSISTÊNCIA DE PÁGINAS NO FIRESTORE ===");
  const wsSnap = await db.collection("workspaces").get();
  for (const ws of wsSnap.docs) {
    const pagesSnap = await ws.ref.collection("pages").get();
    const pageMap = new Map<string, any>();
    for (const p of pagesSnap.docs) {
      pageMap.set(p.id, p.data());
    }

    let brokenParents = 0;
    let pathMismatches = 0;
    let trashedCount = 0;

    for (const [id, data] of pageMap.entries()) {
      if (data.deletedAt) trashedCount++;
      if (data.parentPageId) {
        if (!pageMap.has(data.parentPageId)) {
          console.log(`Página [${id}] "${data.title}" aponta para pai inexistente: ${data.parentPageId}`);
          brokenParents++;
        }
      }
      // Verificar se path contém a cadeia de pais
      const expectedPath: string[] = [];
      let cur = data.parentPageId;
      const visited = new Set<string>();
      while (cur && pageMap.has(cur) && !visited.has(cur)) {
        visited.add(cur);
        expectedPath.unshift(cur);
        cur = pageMap.get(cur).parentPageId;
      }
      const actualPath = Array.isArray(data.path) ? data.path : [];
      if (expectedPath.join("/") !== actualPath.join("/")) {
        pathMismatches++;
        // console.log(`Path mismatch na página [${id}]: esperado [${expectedPath}] vs atual [${actualPath}]`);
      }
    }

    console.log(`Workspace ${ws.id}:`);
    console.log(` - Total páginas: ${pagesSnap.size}`);
    console.log(` - Na lixeira (deletedAt != null): ${trashedCount}`);
    console.log(` - Páginas com pai inexistente (broken parent): ${brokenParents}`);
    console.log(` - Discrepâncias de path: ${pathMismatches}`);
  }
}

checkPageConsistency().catch(console.error);
