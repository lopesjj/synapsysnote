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

// Extrai recursivamente todas as strings que parecem storagePaths ou URLs de storage de qualquer objeto
function extractAllStorageRefs(obj: any, foundPaths: Set<string>, foundUrls: Set<string>) {
  if (!obj) return;
  if (typeof obj === "string") {
    if (obj.includes("firebasestorage.googleapis.com") || obj.includes("synapsysnote.firebasestorage.app")) {
      foundUrls.add(obj);
      // tentar extrair o caminho decodificado da url
      try {
        const match = obj.match(/\/o\/([^?]+)/);
        if (match && match[1]) {
          foundPaths.add(decodeURIComponent(match[1]));
        }
      } catch {}
    }
    if (obj.startsWith("workspaces/") || obj.startsWith("users/")) {
      foundPaths.add(obj);
    }
    return;
  }
  if (Array.isArray(obj)) {
    for (const item of obj) {
      extractAllStorageRefs(item, foundPaths, foundUrls);
    }
    return;
  }
  if (typeof obj === "object") {
    for (const key of Object.keys(obj)) {
      if (key === "storagePath" && typeof obj[key] === "string") {
        foundPaths.add(obj[key]);
      }
      extractAllStorageRefs(obj[key], foundPaths, foundUrls);
    }
  }
}

async function runAudit() {
  console.log("=== INICIANDO AUDITORIA DO STORAGE E FIRESTORE ===");
  const startTime = Date.now();

  // 1. Obter todos os arquivos do bucket
  console.log("Listando todos os arquivos no bucket do Storage...");
  const [files] = await bucket.getFiles();
  console.log(`Total de arquivos no Storage: ${files.length}`);

  const storageFileMap = new Map<string, { size: number; contentType: string; updated: string }>();
  for (const f of files) {
    storageFileMap.set(f.name, {
      size: Number(f.metadata.size ?? 0),
      contentType: f.metadata.contentType ?? "",
      updated: f.metadata.updated ?? "",
    });
  }

  // 2. Coletar coleções raiz do Firestore
  console.log("Examinando coleções no Firestore...");
  const rootCollections = await db.listCollections();
  console.log("Coleções raiz:", rootCollections.map(c => c.id));

  const referencedPaths = new Set<string>();
  const referencedUrls = new Set<string>();

  // Contadores
  let totalWorkspaces = 0;
  let totalPages = 0;
  let totalDatabases = 0;
  let totalRows = 0;
  let totalUsers = 0;
  let totalJobs = 0;

  for (const col of rootCollections) {
    const colName = col.id;
    const snap = await col.get();
    console.log(`Coleção raiz [${colName}]: ${snap.size} documentos`);

    if (colName === "workspaces") {
      totalWorkspaces = snap.size;
      for (const wsDoc of snap.docs) {
        const wsData = wsDoc.data();
        extractAllStorageRefs(wsData, referencedPaths, referencedUrls);

        // Subcoleções do workspace
        const subCollections = await wsDoc.ref.listCollections();
        for (const subCol of subCollections) {
          const subSnap = await subCol.get();
          if (subCol.id === "pages") {
            totalPages += subSnap.size;
            for (const pDoc of subSnap.docs) {
              extractAllStorageRefs(pDoc.data(), referencedPaths, referencedUrls);
              // Verificar subcoleções da página, como 'versions'
              const pageSubs = await pDoc.ref.listCollections();
              for (const pSub of pageSubs) {
                const pSubSnap = await pSub.get();
                for (const vDoc of pSubSnap.docs) {
                  extractAllStorageRefs(vDoc.data(), referencedPaths, referencedUrls);
                }
              }
            }
          } else if (subCol.id === "databases") {
            totalDatabases += subSnap.size;
            for (const dDoc of subSnap.docs) {
              extractAllStorageRefs(dDoc.data(), referencedPaths, referencedUrls);
              const rowsSnap = await dDoc.ref.collection("rows").get();
              totalRows += rowsSnap.size;
              for (const rDoc of rowsSnap.docs) {
                extractAllStorageRefs(rDoc.data(), referencedPaths, referencedUrls);
              }
            }
          } else {
            for (const doc of subSnap.docs) {
              extractAllStorageRefs(doc.data(), referencedPaths, referencedUrls);
            }
          }
        }
      }
    } else if (colName === "users") {
      totalUsers = snap.size;
      for (const uDoc of snap.docs) {
        extractAllStorageRefs(uDoc.data(), referencedPaths, referencedUrls);
      }
    } else {
      for (const doc of snap.docs) {
        extractAllStorageRefs(doc.data(), referencedPaths, referencedUrls);
      }
    }
  }

  console.log(`\nResumo Firestore:`);
  console.log(`- Workspaces: ${totalWorkspaces}`);
  console.log(`- Páginas: ${totalPages}`);
  console.log(`- Databases: ${totalDatabases}`);
  console.log(`- Rows: ${totalRows}`);
  console.log(`- Usuários: ${totalUsers}`);
  console.log(`- Total referências identificadas (paths únicos): ${referencedPaths.size}`);
  console.log(`- Total referências identificadas (URLs únicas): ${referencedUrls.size}`);

  // 3. Comparar arquivos no Storage com referências do Firestore
  const orphanFiles: Array<{ name: string; size: number; contentType: string; updated: string; reason: string }> = [];
  const validFiles: string[] = [];

  for (const [filePath, fileMeta] of storageFileMap.entries()) {
    // Verifica se o caminho exato foi referenciado
    const isDirectlyReferenced = referencedPaths.has(filePath);
    
    // Verifica se alguma URL decodificada aponta para ele
    let isUrlReferenced = false;
    if (!isDirectlyReferenced) {
      for (const url of referencedUrls) {
        if (url.includes(encodeURIComponent(filePath)) || url.includes(filePath)) {
          isUrlReferenced = true;
          break;
        }
      }
    }

    if (isDirectlyReferenced || isUrlReferenced) {
      validFiles.push(filePath);
    } else {
      orphanFiles.push({
        name: filePath,
        size: fileMeta.size,
        contentType: fileMeta.contentType,
        updated: fileMeta.updated,
        reason: "Nenhum documento no Firestore (páginas, versões, databases, rows, usuários) referencia este arquivo.",
      });
    }
  }

  // 4. Também verificar se há referências no Firestore a arquivos que NÃO existem no Storage (arquivos fantasmas)
  const missingFiles: string[] = [];
  for (const p of referencedPaths) {
    if (!storageFileMap.has(p)) {
      // Ignorar caminhos que não sejam de arquivos do bucket (ex: prefixos ou URLs externas)
      if (p.startsWith("workspaces/") || p.startsWith("users/")) {
        missingFiles.push(p);
      }
    }
  }

  console.log(`\n=== RESULTADO DA AUDITORIA ===`);
  console.log(`Total arquivos no Storage: ${storageFileMap.size}`);
  console.log(`Arquivos referenciados e válidos: ${validFiles.length}`);
  console.log(`Arquivos ÓRFÃOS detectados: ${orphanFiles.length}`);
  console.log(`Referências no Firestore sem arquivo no Storage (fantasmas): ${missingFiles.length}`);

  let totalOrphanBytes = 0;
  for (const o of orphanFiles) {
    totalOrphanBytes += o.size;
  }
  console.log(`Tamanho total dos arquivos órfãos: ${(totalOrphanBytes / (1024 * 1024)).toFixed(2)} MB`);

  // Salvar relatório detalhado em JSON
  const reportPath = path.resolve(process.cwd(), "scratch/storage-audit-report.json");
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        durationMs: Date.now() - startTime,
        storageTotal: storageFileMap.size,
        validCount: validFiles.length,
        orphanCount: orphanFiles.length,
        orphanTotalBytes: totalOrphanBytes,
        missingInStorageCount: missingFiles.length,
        orphanFilesSample: orphanFiles.slice(0, 100),
        allOrphanNames: orphanFiles.map((o) => o.name),
        missingFilesSample: missingFiles.slice(0, 50),
      },
      null,
      2
    ),
    "utf-8"
  );
  console.log(`Relatório completo salvo em: ${reportPath}`);
}

runAudit().catch((err) => {
  console.error("Erro fatal na auditoria:", err);
  process.exit(1);
});
