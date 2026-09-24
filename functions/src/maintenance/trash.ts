import { onSchedule } from "firebase-functions/v2/scheduler";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import type { DocumentSnapshot } from "firebase-admin/firestore";
import { assertWorkspaceEditor, bucket, db } from "../lib/firebase";
import { REGION } from "../region";
import {
  expiredTrash,
  purgeExpiredQuarantine,
  purgeExpiredVersions,
  purgeItems,
  workspacesWithExpiredTrash,
} from "../shared/purge-core";
import { TRASH_RETENTION_MS, VERSION_RETENTION_MS } from "../shared/retention";
import { purgeOldExports } from "../shared/export-core";

const SCHEDULE_TIMEOUT_SECONDS = 1800;
const TIME_BUDGET_MS = (SCHEDULE_TIMEOUT_SECONDS - 120) * 1000;

export const purgeExpiredTrash = onSchedule(
  {
    schedule: "every day 03:30",
    timeZone: "America/Sao_Paulo",
    region: REGION,
    memory: "1GiB",
    timeoutSeconds: SCHEDULE_TIMEOUT_SECONDS,
    retryCount: 1,
  },
  async () => {
    const startedAt = Date.now();
    const cutoff = new Date(startedAt - TRASH_RETENTION_MS);
    let versions = 0;
    try {
      versions = await purgeExpiredVersions(
        db,
        new Date(startedAt - VERSION_RETENTION_MS),
        startedAt + TIME_BUDGET_MS / 3
      );
    } catch (error) {
      logger.error("version purge failed", { error });
    }
    let exports = 0;
    try {
      exports = await purgeOldExports(bucket(), startedAt);
    } catch (error) {
      logger.error("export cleanup failed", { error });
    }
    const workspaceIds = await workspacesWithExpiredTrash(db, cutoff, startedAt);
    let purged = 0;
    let quarantined = 0;
    let pending = 0;

    for (const workspaceId of workspaceIds) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) {
        pending += 1;
        continue;
      }
      try {
        purged += await purgeItems(db, bucket(), workspaceId, await expiredTrash(db, workspaceId, cutoff));
        quarantined += await purgeExpiredQuarantine(db, bucket(), workspaceId);
      } catch (error) {
        logger.error("trash purge failed for workspace", { workspaceId, error });
      }
    }

    logger.info("trash purge finished", { workspaces: workspaceIds.length, purged, quarantined, versions, exports, pending });
  }
);

export const purgeExpiredQuarantineMedia = onSchedule(
  {
    schedule: "every sunday 04:00",
    timeZone: "America/Sao_Paulo",
    region: REGION,
    memory: "1GiB",
    timeoutSeconds: SCHEDULE_TIMEOUT_SECONDS,
    retryCount: 1,
  },
  async () => {
    const startedAt = Date.now();
    const workspaceIds = await workspacesWithExpiredTrash(db, new Date(startedAt - TRASH_RETENTION_MS), startedAt);
    let total = 0;
    for (const workspaceId of workspaceIds) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) break;
      try {
        total += await purgeExpiredQuarantine(db, bucket(), workspaceId);
      } catch (error) {
        logger.error("quarantine purge failed for workspace", { workspaceId, error });
      }
    }
    logger.info("quarantine media purge finished", { total });
  }
);

export const purgePage = onCall({ region: REGION, timeoutSeconds: 300, memory: "1GiB" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Login obrigatório");
  const { workspaceId, pageId } = (request.data ?? {}) as { workspaceId?: string; pageId?: string };
  if (!workspaceId || !pageId) {
    throw new HttpsError("invalid-argument", "workspaceId e pageId são obrigatórios");
  }

  try {
    await assertWorkspaceEditor(workspaceId, request.auth.uid);
  } catch (error) {
    throw new HttpsError("permission-denied", (error as Error).message);
  }

  const pages = db.collection("workspaces").doc(workspaceId).collection("pages");
  const [page, descendants, directChildren] = await Promise.all([
    pages.doc(pageId).get(),
    pages.where("path", "array-contains", pageId).get(),
    pages.where("parentPageId", "==", pageId).get(),
  ]);
  if (!page.exists || !page.get("deletedAt")) {
    throw new HttpsError("failed-precondition", "A nota não está na lixeira");
  }

  const byId = new Map<string, DocumentSnapshot>([[page.id, page]]);
  for (const snap of [...descendants.docs, ...directChildren.docs]) {
    if (!byId.has(snap.id) && snap.get("deletedAt")) byId.set(snap.id, snap);
  }
  await purgeItems(db, bucket(), workspaceId, { pages: [...byId.values()], databases: [], notebooks: [] });
  return { ok: true };
});
