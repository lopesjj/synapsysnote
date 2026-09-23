import "server-only";

import { adminBucket, adminDb, isAdminConfigured } from "@/lib/firebase/admin";
import type { AppBlock } from "@/types/models";

type Snap = FirebaseFirestore.DocumentSnapshot;
type Ref = FirebaseFirestore.DocumentReference;
type Data = FirebaseFirestore.DocumentData;

const BATCH_LIMIT = 400;

export const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export function extractStoragePath(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const val = value.trim();
  if (val.startsWith("workspaces/") || val.startsWith("users/")) return val;
  if (!val.includes("firebasestorage.googleapis.com") && !val.includes("firebasestorage.app")) return null;
  const match = val.match(/\/o\/([^?]+)/);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function parseBlocks(data: Data | undefined): AppBlock[] {
  if (!data) return [];
  if (typeof data.blocksJson === "string") {
    try {
      const parsed = JSON.parse(data.blocksJson);
      if (Array.isArray(parsed)) return parsed as AppBlock[];
    } catch {}
  }
  return Array.isArray(data.blocks) ? (data.blocks as AppBlock[]) : [];
}

function addPath(value: unknown, into: Set<string>) {
  const path = extractStoragePath(value);
  if (path) into.add(path);
}

function addBlockPaths(blocks: AppBlock[], into: Set<string>) {
  const walk = (list: AppBlock[]) => {
    for (const block of list) {
      addPath(block.media?.storagePath, into);
      addPath(block.media?.url, into);
      if (block.children?.length) walk(block.children);
    }
  };
  walk(blocks);
}

function addRowPaths(values: Record<string, unknown> | undefined, into: Set<string>) {
  for (const value of Object.values(values ?? {})) {
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      if (!item || typeof item !== "object") continue;
      const entry = item as { storagePath?: unknown; url?: unknown };
      addPath(entry.storagePath, into);
      addPath(entry.url, into);
    }
  }
}

const CARD_IMAGE_FIELDS = [
  "frontImageStoragePath",
  "backImageStoragePath",
  "imageStoragePath",
  "frontImageUrl",
  "backImageUrl",
  "imageUrl",
];

function addCardPaths(data: Data, into: Set<string>) {
  for (const field of CARD_IMAGE_FIELDS) addPath(data[field], into);
}

export interface PurgeSet {
  pages: Snap[];
  databases: Snap[];
  notebooks: Snap[];
}

function workspaceRef(workspaceId: string) {
  return adminDb().collection("workspaces").doc(workspaceId);
}

/**
 * Arquivos em uso fora do que vai ser apagado. Midia colada de uma nota para
 * outra, copias antigas e cards duplicados apontam para o mesmo objeto do
 * Storage: apaga-lo quebraria o outro dono.
 */
export async function referencedPaths(workspaceId: string, purge: PurgeSet): Promise<Set<string>> {
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
    addPath(data.coverUrl, refs);
    addPath(data.icon, refs);
  }
  for (const notebook of notebooks.docs) {
    if (skipNotebooks.has(notebook.id)) continue;
    addPath(notebook.get("coverUrl"), refs);
    addPath(notebook.get("emoji"), refs);
  }
  for (const database of databases.docs) {
    if (skipDatabases.has(database.id)) continue;
    addPath(database.get("icon"), refs);
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
  const db = adminDb();
  for (let start = 0; start < refs.length; start += BATCH_LIMIT) {
    const batch = db.batch();
    for (const ref of refs.slice(start, start + BATCH_LIMIT)) batch.delete(ref);
    await batch.commit();
  }
}

async function listPrefix(prefix: string): Promise<string[]> {
  try {
    const [files] = await adminBucket().getFiles({ prefix });
    return files.map((file) => file.name);
  } catch {
    return [];
  }
}

async function deleteStorage(workspaceId: string, candidates: Set<string>, inUse: Set<string>) {
  if (!isAdminConfigured()) return;
  const ownPrefix = `workspaces/${workspaceId}/`;
  const deletable = [...candidates].filter((path) => path.startsWith(ownPrefix) && !inUse.has(path));
  const bucket = adminBucket();
  await Promise.allSettled(
    deletable.map((path) =>
      bucket
        .file(path)
        .delete({ ignoreNotFound: true })
        .catch(() => {})
    )
  );
}

/** Apaga paginas, bases e cadernos da lixeira e os arquivos que so eles usavam. */
export async function purgeItems(workspaceId: string, purge: PurgeSet): Promise<number> {
  const total = purge.pages.length + purge.databases.length + purge.notebooks.length;
  if (!total) return 0;

  const inUse = await referencedPaths(workspaceId, purge);
  const candidates = new Set<string>();
  const docRefs: Ref[] = [];
  const ws = workspaceRef(workspaceId);

  for (const page of purge.pages) {
    const data = page.data() ?? {};
    addBlockPaths(parseBlocks(data), candidates);
    addPath(data.coverUrl, candidates);
    addPath(data.icon, candidates);
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
      addPath(media.get("storagePath"), candidates);
      docRefs.push(media.ref);
    }
    docRefs.push(page.ref);
  }

  for (const database of purge.databases) {
    addPath(database.get("icon"), candidates);
    const rows = await database.ref.collection("rows").get();
    for (const row of rows.docs) {
      addRowPaths(row.get("values"), candidates);
      docRefs.push(row.ref);
    }
    docRefs.push(database.ref);
  }

  for (const notebook of purge.notebooks) {
    addPath(notebook.get("coverUrl"), candidates);
    addPath(notebook.get("emoji"), candidates);
    docRefs.push(notebook.ref);
  }

  await deleteStorage(workspaceId, candidates, inUse);
  await deleteRefs(docRefs);
  return total;
}

/** Midias em quarentena vencidas que nenhuma nota voltou a usar. */
export async function purgeExpiredQuarantine(workspaceId: string): Promise<number> {
  const expired = await workspaceRef(workspaceId)
    .collection("trashed_media")
    .where("expiresAt", "<=", Date.now())
    .get();
  if (expired.empty) return 0;

  const inUse = await referencedPaths(workspaceId, { pages: [], databases: [], notebooks: [] });
  const candidates = new Set<string>();
  for (const doc of expired.docs) addPath(doc.get("storagePath"), candidates);
  await deleteStorage(workspaceId, candidates, inUse);
  await deleteRefs(expired.docs.map((doc) => doc.ref));
  return expired.size;
}
