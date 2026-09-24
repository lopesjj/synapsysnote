import { randomUUID } from "node:crypto";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { getAuth } from "firebase-admin/auth";
import { bucket, db } from "../lib/firebase";
import { REGION } from "../region";
import { EXPORT_RETENTION_MS, exportPrefixOf, writeAccountExport } from "../shared/export-core";

const TIMEOUT_SECONDS = 3600;
const LOCK_MS = TIMEOUT_SECONDS * 1000;

export const exportAccountData = onCall(
  { region: REGION, timeoutSeconds: TIMEOUT_SECONDS, memory: "1GiB", maxInstances: 5 },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Login obrigatório");

    const lock = db.collection("export_locks").doc(uid);
    const acquired = await db.runTransaction(async (tx) => {
      const current = await tx.get(lock);
      if (current.exists && Number(current.get("until") ?? 0) > Date.now()) return false;
      tx.set(lock, { until: Date.now() + LOCK_MS });
      return true;
    });
    if (!acquired) throw new HttpsError("resource-exhausted", "Uma exportação já está em andamento.");

    const storage = bucket();
    try {
      await storage.deleteFiles({ prefix: exportPrefixOf(uid) }).catch(() => undefined);
      const stamp = new Date().toISOString().slice(0, 10);
      const name = `synapsys-note-dados-${stamp}.zip`;
      const path = `${exportPrefixOf(uid)}${randomUUID().slice(0, 8)}-${name}`;
      const summary = await writeAccountExport(
        { db, auth: getAuth(), bucket: storage },
        uid,
        storage.file(path).createWriteStream({
          resumable: true,
          contentType: "application/zip",
          metadata: {
            contentDisposition: `attachment; filename="${name}"`,
            cacheControl: "private, no-store",
            metadata: { firebaseStorageDownloadTokens: randomUUID() },
          },
        })
      );
      logger.info("account export ready", { uid, ...summary });
      return { path, expiresAt: Date.now() + EXPORT_RETENTION_MS };
    } catch (error) {
      logger.error("account export failed", { uid, error });
      throw new HttpsError("internal", "Não foi possível exportar os dados.");
    } finally {
      await lock.delete().catch(() => undefined);
    }
  }
);
