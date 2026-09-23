import { Timestamp } from "firebase-admin/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { assertWorkspaceEditor, bucket, db, pagesRef, workspaceRef } from "../lib/firebase";
import type { AppBlock } from "../types";


const REGION = process.env.FUNCTIONS_REGION || "us-east1";
const RETENTION_DAYS = Number(process.env.TRASH_RETENTION_DAYS ?? 30);
const BATCH_LIMIT = 400;

type Snap = FirebaseFirestore.DocumentSnapshot;
type Ref = FirebaseFirestore.DocumentReference;

function extractStoragePathFromUrl(url: unknown): string | null {
  if (typeof url !== "string" || !url.trim()) return null;
  const value = url.trim();
  if (!value.includes("firebasestorage.googleapis.com") && !value.includes("firebasestorage.app")) {
    if (value.startsWith("workspaces/") || value.startsWith("users/")) return value;
    return null;
  }
  const match = value.match(/\/o\/([^?]+)/);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function parseBlocks(data: FirebaseFirestore.DocumentData | undefined): AppBlock[] {
  if (!data) return [];
  if (typeof data.blocksJson === "string") {
    try {
      const parsed = JSON.parse(data.blocksJson);
      if (Array.isArray(parsed)) return parsed as AppBlock[];
    } catch {}
  }
  return Array.isArray(data.blocks) ? (data.blocks as AppBlock[]) : [];
}

function addBlockPaths(blocks: AppBlock[], into: Set<string>) {
  const walk = (list: AppBlock[]) => {
    for (const block of list) {
      if (block.media?.storagePath) into.add(block.media.storagePath);
      const fromUrl = extractStoragePathFromUrl(block.media?.url);
      if (fromUrl) into.add(fromUrl);
      if (block.children?.length) walk(block.children);
    }
  };
  walk(blocks);
}

function addValuePaths(value: unknown, into: Set<string>) {
  const path = extractStoragePathFromUrl(value);
  if (path) into.add(path);
}

function addRowPaths(values: Record<string, unknown> | undefined, into: Set<string>) {
  for (const value of Object.values(values ?? {})) {
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      if (!item || typeof item !== "object") continue;
      const entry = item as { storagePath?: unknown; url?: unknown };
      addValuePaths(entry.storagePath, into);
      addValuePaths(entry.url, into);
    }
  }
}

function addCardPaths(data: FirebaseFirestore.DocumentData, into: Set<string>) {
  for (const field of [
    "frontImageStoragePath",
    "backImageStoragePath",
    "imageStoragePath",
    "frontImageUrl",
    "backImageUrl",
    "imageUrl",
  ]) {
    addValuePaths(data[field], into);
  }
}

interface PurgeSet {
  pages: Snap[];
  databases: Snap[];
  notebooks: Snap[];
}

/**
 * Arquivos que ainda estao em uso fora do que vai ser apagado. Uma midia colada
 * de uma nota para outra, uma copia antiga ou um card duplicado apontam para o
 * mesmo objeto do Storage: apaga-lo quebraria o outro dono.
 */
async function referencedPaths(workspaceId: string, purge: PurgeSet): Promise<Set<string>> {
  const skipPages = new Set(purge.pages.map((snap) => snap.id));
  const skipDatabases = new Set(purge.databases.map((snap) => snap.id));
  const skipNotebooks = new Set(purge.notebooks.map((snap) => snap.id));
  const ws = workspaceRef(workspaceId);
  const refs = new Set<string>();

  const [pages, databases, notebooks, cards] = await Promise.all([
    ws.collection("pages").get(),
    ws.collection("databases").get(),
    ws.collection("notebooks").get(),
    ws.collection("flashcards").get(),
  ]);

  for (const page of pages.docs) {
    if (skipPages.has(page.id)) continue;
    const data = page.data();
    addBlockPaths(parseBlocks(data), refs);
    addValuePaths(data.coverUrl, refs);
    addValuePaths(data.icon, refs);
  }
  for (const notebook of notebooks.docs) {
    if (skipNotebooks.has(notebook.id)) continue;
    addValuePaths(notebook.get("coverUrl"), refs);
    addValuePaths(notebook.get("emoji"), refs);
  }
  for (const database of databases.docs) {
    if (skipDatabases.has(database.id)) continue;
    addValuePaths(database.get("icon"), refs);
    const rows = await database.ref.collection("rows").get();
    for (const row of rows.docs) addRowPaths(row.get("values"), refs);
  }
  for (const card of cards.docs) {
    if (skipPages.has(String(card.get("pageId") ?? ""))) continue;
    addCardPaths(card.data(), refs);
  }
  return refs;
}

async function deleteRefs(refs: Ref[]) {
  for (let start = 0; start < refs.length; start += BATCH_LIMIT) {
    const batch = db.batch();
    for (const ref of refs.slice(start, start + BATCH_LIMIT)) batch.delete(ref);
    await batch.commit();
  }
}

async function listPrefix(prefix: string): Promise<string[]> {
  try {
    const [files] = await bucket().getFiles({ prefix });
    return files.map((file) => file.name);
  } catch {
    return [];
  }
}

/** Apaga paginas, bases e cadernos e os arquivos que so eles usavam. */
async function purgeItems(workspaceId: string, purge: PurgeSet): Promise<void> {
  if (!purge.pages.length && !purge.databases.length && !purge.notebooks.length) return;

  const inUse = await referencedPaths(workspaceId, purge);
  const candidates = new Set<string>();
  const docRefs: Ref[] = [];
  const ws = workspaceRef(workspaceId);

  for (const page of purge.pages) {
    const data = page.data() ?? {};
    addBlockPaths(parseBlocks(data), candidates);
    addValuePaths(data.coverUrl, candidates);
    addValuePaths(data.icon, candidates);
    for (const prefix of [
      `workspaces/${workspaceId}/uploads/${page.id}/`,
      `workspaces/${workspaceId}/audio/${page.id}/`,
    ]) {
      for (const name of await listPrefix(prefix)) candidates.add(name);
    }

    const [versions, cards, quarantined] = await Promise.all([
      page.ref.collection("versions").get(),
      ws.collection("flashcards").where("pageId", "==", page.id).get(),
      ws.collection("trashed_media").where("pageId", "==", page.id).get(),
    ]);
    for (const version of versions.docs) {
      addBlockPaths(parseBlocks(version.data()), candidates);
      docRefs.push(version.ref);
    }
    for (const card of cards.docs) {
      addCardPaths(card.data(), candidates);
      docRefs.push(card.ref);
    }
    for (const media of quarantined.docs) {
      addValuePaths(media.get("storagePath"), candidates);
      docRefs.push(media.ref);
    }
    docRefs.push(page.ref);
  }

  for (const database of purge.databases) {
    addValuePaths(database.get("icon"), candidates);
    const rows = await database.ref.collection("rows").get();
    for (const row of rows.docs) {
      addRowPaths(row.get("values"), candidates);
      docRefs.push(row.ref);
    }
    docRefs.push(database.ref);
  }

  for (const notebook of purge.notebooks) {
    addValuePaths(notebook.get("coverUrl"), candidates);
    addValuePaths(notebook.get("emoji"), candidates);
    docRefs.push(notebook.ref);
  }

  const ownPrefix = `workspaces/${workspaceId}/`;
  const deletable = [...candidates].filter((path) => path.startsWith(ownPrefix) && !inUse.has(path));
  await Promise.allSettled(
    deletable.map((path) =>
      bucket()
        .file(path)
        .delete({ ignoreNotFound: true })
        .catch((error) => logger.warn("failed to delete storage object", { path, error }))
    )
  );

  await deleteRefs(docRefs);
}

export const purgeExpiredTrash = onSchedule(
  { schedule: "every day 03:30", timeZone: "America/Sao_Paulo", region: REGION, memory: "512MiB" },
  async () => {
    const cutoff = Timestamp.fromMillis(Date.now() - RETENTION_DAYS * 86_400_000);
    const workspaces = await db.collection("workspaces").get();
    let purged = 0;

    for (const workspace of workspaces.docs) {
      try {
        const [pages, databases, notebooks] = await Promise.all([
          workspace.ref.collection("pages").where("deletedAt", "<=", cutoff).limit(200).get(),
          workspace.ref.collection("databases").where("deletedAt", "<=", cutoff).limit(100).get(),
          workspace.ref.collection("notebooks").where("deletedAt", "<=", cutoff).limit(100).get(),
        ]);
        await purgeItems(workspace.id, {
          pages: pages.docs,
          databases: databases.docs,
          notebooks: notebooks.docs,
        });
        purged += pages.size + databases.size + notebooks.size;
      } catch (error) {
        logger.error("trash purge failed for workspace", { workspaceId: workspace.id, error });
      }
    }

    logger.info("trash purge finished", { purged, retentionDays: RETENTION_DAYS });
  }
);

export const purgeExpiredQuarantineMedia = onSchedule(
  { schedule: "every sunday 04:00", timeZone: "America/Sao_Paulo", region: REGION, memory: "512MiB" },
  async () => {
    const workspaces = await db.collection("workspaces").get();
    let totalPurged = 0;
    const now = Date.now();

    for (const workspace of workspaces.docs) {
      try {
        const trashedMediaSnap = await workspace.ref
          .collection("trashed_media")
          .where("expiresAt", "<=", now)
          .limit(300)
          .get();
        if (trashedMediaSnap.empty) continue;

        // A midia pode ter voltado a ser usada (colada em outra nota, por
        // exemplo) depois de entrar em quarentena.
        const inUse = await referencedPaths(workspace.id, { pages: [], databases: [], notebooks: [] });
        const ownPrefix = `workspaces/${workspace.id}/`;
        const paths = trashedMediaSnap.docs
          .map((doc) => String(doc.get("storagePath") ?? ""))
          .filter((path) => path.startsWith(ownPrefix) && !inUse.has(path));

        await Promise.allSettled(
          paths.map((path) =>
            bucket()
              .file(path)
              .delete({ ignoreNotFound: true })
              .catch(() => {})
          )
        );
        await deleteRefs(trashedMediaSnap.docs.map((doc) => doc.ref));
        totalPurged += trashedMediaSnap.size;
      } catch (error) {
        logger.error("quarantine purge failed for workspace", { workspaceId: workspace.id, error });
      }
    }

    logger.info("quarantine media purge finished", { totalPurged });
  }
);

/**
 * Exclusao definitiva de uma nota que ja esta na lixeira. As subnotas so saem
 * junto quando tambem estao na lixeira: uma subnota restaurada antes continua
 * viva.
 */
export const purgePage = onCall({ region: REGION }, async (request) => {
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

  const pages = pagesRef(workspaceId);
  const [page, descendants, directChildren] = await Promise.all([
    pages.doc(pageId).get(),
    pages.where("path", "array-contains", pageId).get(),
    pages.where("parentPageId", "==", pageId).get(),
  ]);
  if (!page.exists || !page.get("deletedAt")) {
    throw new HttpsError("failed-precondition", "A nota não está na lixeira");
  }

  const byId = new Map<string, Snap>([[page.id, page]]);
  for (const snap of [...descendants.docs, ...directChildren.docs]) {
    if (!byId.has(snap.id) && snap.get("deletedAt")) byId.set(snap.id, snap);
  }
  const trashed = [...byId.values()];
  await purgeItems(workspaceId, { pages: trashed, databases: [], notebooks: [] });
  return { ok: true };
});
