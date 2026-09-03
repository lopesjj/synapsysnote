import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { assertWorkspaceEditor, bucket, db, pagesRef } from "../lib/firebase";
import type { AppBlock } from "../types";

/**
 * Trash retention: pages soft-deleted more than 30 days ago are removed for
 * good, together with any Storage object they own. Version snapshots follow the
 * same window.
 */

const REGION = process.env.FUNCTIONS_REGION || "us-central1";
const RETENTION_DAYS = Number(process.env.TRASH_RETENTION_DAYS ?? 30);

export const purgeExpiredTrash = onSchedule(
  { schedule: "every day 03:30", timeZone: "America/Sao_Paulo", region: REGION, memory: "512MiB" },
  async () => {
    const cutoff = Timestamp.fromMillis(Date.now() - RETENTION_DAYS * 86_400_000);
    const workspaces = await db.collection("workspaces").get();
    let purged = 0;

    for (const workspace of workspaces.docs) {
      const expired = await pagesRef(workspace.id)
        .where("deletedAt", "<=", cutoff)
        .limit(200)
        .get();

      for (const page of expired.docs) {
        await deleteStorageObjects(page.get("blocks") ?? []);
        const versions = await page.ref.collection("versions").get();
        await Promise.all(versions.docs.map((version) => version.ref.delete()));
        await page.ref.delete();
        purged += 1;
      }
    }

    logger.info("trash purge finished", { purged, retentionDays: RETENTION_DAYS });
  }
);

/** Immediate hard delete requested from the trash screen. */
export const purgePage = onCall({ region: REGION }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Login obrigatório");
  const { workspaceId, pageId } = request.data as { workspaceId: string; pageId: string };

  try {
    await assertWorkspaceEditor(workspaceId, request.auth.uid);
  } catch (error) {
    throw new HttpsError("permission-denied", (error as Error).message);
  }

  const ref = pagesRef(workspaceId).doc(pageId);
  const page = await ref.get();
  if (!page.exists) return { ok: true };

  await deleteStorageObjects(page.get("blocks") ?? []);
  const versions = await ref.collection("versions").get();
  await Promise.all(versions.docs.map((version) => version.ref.delete()));
  await ref.delete();
  return { ok: true };
});

/** Restores a page and clears its deletion timestamp. */
export const restorePage = onCall({ region: REGION }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Login obrigatório");
  const { workspaceId, pageId } = request.data as { workspaceId: string; pageId: string };
  await pagesRef(workspaceId).doc(pageId).update({
    deletedAt: null,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { ok: true };
});

async function deleteStorageObjects(blocks: AppBlock[]) {
  const paths: string[] = [];
  const walk = (list: AppBlock[]) => {
    for (const block of list) {
      if (block.media?.storagePath) paths.push(block.media.storagePath);
      if (block.children?.length) walk(block.children);
    }
  };
  walk(blocks);

  await Promise.all(
    paths.map((path) =>
      bucket()
        .file(path)
        .delete()
        .catch((error) => logger.warn("failed to delete storage object", { path, error }))
    )
  );
}
