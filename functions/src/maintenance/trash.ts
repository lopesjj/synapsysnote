import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { assertWorkspaceEditor, bucket, db, pagesRef } from "../lib/firebase";
import type { AppBlock } from "../types";


const REGION = process.env.FUNCTIONS_REGION || "us-central1";
const RETENTION_DAYS = Number(process.env.TRASH_RETENTION_DAYS ?? 30);

function extractStoragePathFromUrl(url: unknown): string | null {
  if (typeof url !== "string") return null;
  if (!url.includes("firebasestorage.googleapis.com") && !url.includes("firebasestorage.app")) {
    if (url.startsWith("workspaces/") || url.startsWith("users/")) return url;
    return null;
  }
  try {
    const match = url.match(/\/o\/([^?]+)/);
    if (match && match[1]) {
      return decodeURIComponent(match[1]);
    }
  } catch {}
  return null;
}

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
        const versions = await page.ref.collection("versions").get();
        await deleteStorageObjects(
          workspace.id,
          page.id,
          page.get("blocks") ?? [],
          versions.docs.map((v) => v.get("blocks") ?? []),
          [page.get("coverUrl"), page.get("icon")]
        );
        await Promise.all(versions.docs.map((version) => version.ref.delete()));
        await page.ref.delete();
        purged += 1;
      }
    }

    logger.info("trash purge finished", { purged, retentionDays: RETENTION_DAYS });
  }
);

export const purgeExpiredQuarantineMedia = onSchedule(
  { schedule: "every 7 days", timeZone: "America/Sao_Paulo", region: REGION, memory: "512MiB" },
  async () => {
    const workspaces = await db.collection("workspaces").get();
    let totalPurged = 0;
    const now = Date.now();

    for (const workspace of workspaces.docs) {
      const trashedMediaSnap = await workspace.ref
        .collection("trashed_media")
        .where("expiresAt", "<=", now)
        .limit(300)
        .get();

      if (trashedMediaSnap.empty) continue;

      const pathsToDelete: string[] = [];
      const docsToDelete: FirebaseFirestore.DocumentReference[] = [];

      for (const doc of trashedMediaSnap.docs) {
        const p = String(doc.get("storagePath") ?? "");
        if (p) pathsToDelete.push(p);
        docsToDelete.push(doc.ref);
      }

      await Promise.allSettled(
        pathsToDelete.map((p) =>
          bucket()
            .file(p)
            .delete({ ignoreNotFound: true })
            .catch(() => {})
        )
      );

      for (let i = 0; i < docsToDelete.length; i += 400) {
        const batch = db.batch();
        for (const ref of docsToDelete.slice(i, i + 400)) {
          batch.delete(ref);
        }
        await batch.commit();
      }

      totalPurged += docsToDelete.length;
    }

    logger.info("quarantine media purge finished", { totalPurged });
  }
);

export const purgePage = onCall({ region: REGION }, async (request: any) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Login obrigatório");
  const { workspaceId, pageId } = request.data as { workspaceId: string; pageId: string };

  try {
    await assertWorkspaceEditor(workspaceId, request.auth.uid);
  } catch (error) {
    throw new HttpsError("permission-denied", (error as Error).message);
  }

  const pages = pagesRef(workspaceId);
  const [page, descendants, directChildren] = await Promise.all([
    pages.doc(pageId).get(),
    pages.where("path", "array-contains", pageId).get(),
    pages.where("parentPageId", "==", pageId).get(),
  ]);

  const seenIds = new Set<string>();
  const docs: FirebaseFirestore.DocumentSnapshot[] = [];
  if (page.exists) {
    docs.push(page);
    seenIds.add(page.id);
  }
  for (const snap of descendants.docs) {
    if (!seenIds.has(snap.id)) {
      docs.push(snap);
      seenIds.add(snap.id);
    }
  }
  for (const snap of directChildren.docs) {
    if (!seenIds.has(snap.id)) {
      docs.push(snap);
      seenIds.add(snap.id);
    }
  }

  for (const snap of docs) {
    const versions = await snap.ref.collection("versions").get();
    await deleteStorageObjects(
      workspaceId,
      snap.id,
      snap.get("blocks") ?? [],
      versions.docs.map((v) => v.get("blocks") ?? []),
      [snap.get("coverUrl"), snap.get("icon")]
    );
    await Promise.all(versions.docs.map((version) => version.ref.delete()));
    await snap.ref.delete();
  }
  return { ok: true };
});

export const restorePage = onCall({ region: REGION }, async (request: any) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Login obrigatório");
  const { workspaceId, pageId } = request.data as { workspaceId: string; pageId: string };
  await pagesRef(workspaceId).doc(pageId).update({
    deletedAt: null,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { ok: true };
});

async function deleteStorageObjects(
  workspaceId: string,
  pageId: string,
  blocks: AppBlock[],
  versionBlocksList: AppBlock[][] = [],
  extraUrls: unknown[] = []
) {
  const paths = new Set<string>();
  const walk = (list: AppBlock[]) => {
    for (const block of list) {
      if (block.media?.storagePath) paths.add(block.media.storagePath);
      if (block.media?.url) {
        const p = extractStoragePathFromUrl(block.media.url);
        if (p) paths.add(p);
      }
      if (block.children?.length) walk(block.children);
    }
  };
  walk(blocks);
  for (const vBlocks of versionBlocksList) {
    walk(vBlocks);
  }
  for (const u of extraUrls) {
    const p = extractStoragePathFromUrl(u);
    if (p) paths.add(p);
  }

  await Promise.allSettled([
    bucket().deleteFiles({ prefix: `workspaces/${workspaceId}/uploads/${pageId}/` }),
    bucket().deleteFiles({ prefix: `workspaces/${workspaceId}/audio/${pageId}/` }),
    ...Array.from(paths).map((path) =>
      bucket()
        .file(path)
        .delete()
        .catch((error) => logger.warn("failed to delete storage object", { path, error }))
    ),
  ]);
}
