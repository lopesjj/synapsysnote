import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";
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

async function deleteOrphans() {
  const reportPath = path.resolve(process.cwd(), "scratch/storage-audit-report.json");
  if (!fs.existsSync(reportPath)) {
    throw new Error("Relatório de auditoria não encontrado. Execute audit-storage.mts primeiro.");
  }

  const report = JSON.parse(fs.readFileSync(reportPath, "utf-8"));
  const orphanPaths: string[] = report.allOrphanNames;
  const total = orphanPaths.length;
  console.log(`Iniciando exclusão de ${total} arquivos órfãos no bucket ${bucket.name}...`);

  let deletedCount = 0;
  let failedCount = 0;
  let notFoundCount = 0;

  // Processar em chunks com concorrência moderada (ex: 25 por vez)
  const CONCURRENCY = 25;
  for (let i = 0; i < total; i += CONCURRENCY) {
    const chunk = orphanPaths.slice(i, i + CONCURRENCY);
    await Promise.all(
      chunk.map(async (filePath) => {
        try {
          const file = bucket.file(filePath);
          const [exists] = await file.exists();
          if (!exists) {
            notFoundCount++;
            return;
          }
          await file.delete();
          deletedCount++;
        } catch (err: any) {
          if (err.code === 404) {
            notFoundCount++;
          } else {
            console.error(`Falha ao excluir arquivo: ${filePath}`, err.message);
            failedCount++;
          }
        }
      })
    );

    const progress = Math.min(i + CONCURRENCY, total);
    if (progress % 500 === 0 || progress === total) {
      console.log(`Progresso: ${progress}/${total} processados (${deletedCount} apagados, ${notFoundCount} já não existiam, ${failedCount} falhas)`);
    }
  }

  console.log("\n=== LIMPEZA DE ÓRFÃOS FINALIZADA ===");
  console.log(`Total planejado: ${total}`);
  console.log(`Apagados com sucesso: ${deletedCount}`);
  console.log(`Não encontrados (404): ${notFoundCount}`);
  console.log(`Falhas: ${failedCount}`);
}

deleteOrphans().catch((err) => {
  console.error("Erro fatal ao deletar órfãos:", err);
  process.exit(1);
});
