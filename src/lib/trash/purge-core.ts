import type {
  DocumentData,
  DocumentReference,
  DocumentSnapshot,
  Firestore,
  Query,
} from "firebase-admin/firestore";

export interface BucketLike {
  getFiles(options: { prefix: string }): Promise<[Array<{ name: string }>, ...unknown[]]>;
  file(path: string): { delete(options?: { ignoreNotFound?: boolean }): Promise<unknown> };
}

export interface PurgeSet {
  pages: DocumentSnapshot[];
  databases: DocumentSnapshot[];
  notebooks: DocumentSnapshot[];
}

interface MediaBlock {
  media?: { storagePath?: unknown; url?: unknown };
  children?: MediaBlock[];
}

const BATCH_LIMIT = 400;
const IN_QUERY_LIMIT = 30;

export const CARD_IMAGE_FIELDS = [
  "frontImageStoragePath",
  "backImageStoragePath",
  "imageStoragePath",
  "frontImageUrl",
  "backImageUrl",
  "imageUrl",
];

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

export function parseStoredBlocks(data: DocumentData | undefined): MediaBlock[] {
  if (!data) return [];
  if (typeof data.blocksJson === "string") {
    try {
      const parsed = JSON.parse(data.blocksJson);
      if (Array.isArray(parsed)) return parsed as MediaBlock[];
    } catch {}
  }
  return Array.isArray(data.blocks) ? (data.blocks as MediaBlock[]) : [];
}

function addPath(value: unknown, into: Set<string>) {
  const path = extractStoragePath(value);
  if (path) into.add(path);
}

function addBlockPaths(blocks: MediaBlock[], into: Set<string>) {
  for (const block of blocks) {
    addPath(block.media?.storagePath, into);
    addPath(block.media?.url, into);
    if (block.children?.length) addBlockPaths(block.children, into);
  }
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

function addPagePaths(data: DocumentData | undefined, into: Set<string>) {
  if (!data) return;
  addBlockPaths(parseStoredBlocks(data), into);
  addPath(data.coverUrl, into);
  addPath(data.icon, into);
}

function addCardPaths(data: DocumentData | undefined, into: Set<string>) {
  if (!data) return;
  for (const field of CARD_IMAGE_FIELDS) addPath(data[field], into);
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let start = 0; start < items.length; start += size) out.push(items.slice(start, start + size));
  return out;
}

export async function referencedPaths(db: Firestore, workspaceId: string, purge: PurgeSet): Promise<Set<string>> {
  const skipPages = new Set(purge.pages.map((snap) => snap.id));
  const skipDatabases = new Set(purge.databases.map((snap) => snap.id));
  const skipNotebooks = new Set(purge.notebooks.map((snap) => snap.id));
  const ws = db.collection("workspaces").doc(workspaceId);
  const refs = new Set<string>();

  const [pages, databases, notebooks, cards] = await Promise.all([
    ws.collection("pages").select("blocksJson", "blocks", "coverUrl", "icon").get(),
    ws.collection("databases").select("icon").get(),
    ws.collection("notebooks").select("coverUrl", "emoji").get(),
    ws.collection("flashcards").select("pageId", ...CARD_IMAGE_FIELDS).get(),
  ]);

  for (const page of pages.docs) {
    if (!skipPages.has(page.id)) addPagePaths(page.data(), refs);
  }
  for (const notebook of notebooks.docs) {
    if (skipNotebooks.has(notebook.id)) continue;
    addPath(notebook.get("coverUrl"), refs);
    addPath(notebook.get("emoji"), refs);
  }
  const liveDatabases = databases.docs.filter((database) => !skipDatabases.has(database.id));
  for (const database of liveDatabases) addPath(database.get("icon"), refs);
  const rowSets = await Promise.all(liveDatabases.map((database) => database.ref.collection("rows").select("values").get()));
  for (const rows of rowSets) for (const row of rows.docs) addRowPaths(row.get("values"), refs);
  for (const card of cards.docs) {
    if (!skipPages.has(String(card.get("pageId") ?? ""))) addCardPaths(card.data(), refs);
  }
  return refs;
}

async function pathsWrittenSince(
  db: Firestore,
  workspaceId: string,
  since: Date,
  skipPages: Set<string>
): Promise<Set<string>> {
  const ws = db.collection("workspaces").doc(workspaceId);
  const refs = new Set<string>();
  const recent = (query: Query) => query.where("updatedAt", ">=", since).get();
  const [pages, cards, notebooks] = await Promise.all([
    recent(ws.collection("pages")),
    recent(ws.collection("flashcards")),
    recent(ws.collection("notebooks")),
  ]);
  for (const page of pages.docs) {
    if (!skipPages.has(page.id) && !page.get("deletedAt")) addPagePaths(page.data(), refs);
  }
  for (const card of cards.docs) {
    if (!skipPages.has(String(card.get("pageId") ?? ""))) addCardPaths(card.data(), refs);
  }
  for (const notebook of notebooks.docs) {
    addPath(notebook.get("coverUrl"), refs);
    addPath(notebook.get("emoji"), refs);
  }
  return refs;
}

async function deleteRefs(db: Firestore, refs: DocumentReference[]) {
  for (const group of chunk(refs, BATCH_LIMIT)) {
    const batch = db.batch();
    for (const ref of group) batch.delete(ref);
    await batch.commit();
  }
}

async function listPrefix(bucket: BucketLike, prefix: string): Promise<string[]> {
  try {
    const [files] = await bucket.getFiles({ prefix });
    return files.map((file) => file.name);
  } catch {
    return [];
  }
}

async function deleteStorage(
  db: Firestore,
  bucket: BucketLike,
  workspaceId: string,
  candidates: Set<string>,
  inUse: Set<string>,
  scanStartedAt: Date,
  skipPages: Set<string>
) {
  const ownPrefix = `workspaces/${workspaceId}/`;
  let deletable = [...candidates].filter((path) => path.startsWith(ownPrefix) && !inUse.has(path));
  if (!deletable.length) return;
  const reused = await pathsWrittenSince(db, workspaceId, scanStartedAt, skipPages);
  deletable = deletable.filter((path) => !reused.has(path));
  await Promise.allSettled(
    deletable.map((path) =>
      bucket
        .file(path)
        .delete({ ignoreNotFound: true })
        .catch(() => undefined)
    )
  );
}

export async function purgeItems(
  db: Firestore,
  bucket: BucketLike,
  workspaceId: string,
  purge: PurgeSet
): Promise<number> {
  const total = purge.pages.length + purge.databases.length + purge.notebooks.length;
  if (!total) return 0;

  const scanStartedAt = new Date();
  const inUse = await referencedPaths(db, workspaceId, purge);
  const candidates = new Set<string>();
  const docRefs: DocumentReference[] = [];
  const ws = db.collection("workspaces").doc(workspaceId);
  const pageIds = new Set(purge.pages.map((page) => page.id));

  await Promise.all(
    purge.pages.map(async (page) => {
      addPagePaths(page.data(), candidates);
      const [uploads, audio, versions, cards, quarantined, attachments] = await Promise.all([
        listPrefix(bucket, `workspaces/${workspaceId}/uploads/${page.id}/`),
        listPrefix(bucket, `workspaces/${workspaceId}/audio/${page.id}/`),
        page.ref.collection("versions").get(),
        ws.collection("flashcards").where("pageId", "==", page.id).get(),
        ws.collection("trashed_media").where("pageId", "==", page.id).get(),
        ws.collection("attachments").where("pageId", "==", page.id).get(),
      ]);
      for (const name of [...uploads, ...audio]) candidates.add(name);
      for (const version of versions.docs) {
        addBlockPaths(parseStoredBlocks(version.data()), candidates);
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
      for (const attachment of attachments.docs) docRefs.push(attachment.ref);
      docRefs.push(page.ref);
    })
  );

  await Promise.all(
    purge.databases.map(async (database) => {
      addPath(database.get("icon"), candidates);
      const rows = await database.ref.collection("rows").get();
      for (const row of rows.docs) {
        addRowPaths(row.get("values"), candidates);
        docRefs.push(row.ref);
      }
      docRefs.push(database.ref);
    })
  );

  for (const notebook of purge.notebooks) {
    addPath(notebook.get("coverUrl"), candidates);
    addPath(notebook.get("emoji"), candidates);
    docRefs.push(notebook.ref);
  }

  await deleteStorage(db, bucket, workspaceId, candidates, inUse, scanStartedAt, pageIds);
  await deleteRefs(db, docRefs);
  return total;
}

export async function purgeExpiredQuarantine(
  db: Firestore,
  bucket: BucketLike,
  workspaceId: string,
  now = Date.now()
): Promise<number> {
  const expired = await db
    .collection("workspaces")
    .doc(workspaceId)
    .collection("trashed_media")
    .where("expiresAt", "<=", now)
    .get();
  if (expired.empty) return 0;

  const scanStartedAt = new Date();
  const inUse = await referencedPaths(db, workspaceId, { pages: [], databases: [], notebooks: [] });
  const candidates = new Set<string>();
  for (const doc of expired.docs) addPath(doc.get("storagePath"), candidates);
  await deleteStorage(db, bucket, workspaceId, candidates, inUse, scanStartedAt, new Set());
  await deleteRefs(db, expired.docs.map((doc) => doc.ref));
  return expired.size;
}

export async function expiredTrash(db: Firestore, workspaceId: string, cutoff: Date): Promise<PurgeSet> {
  const ws = db.collection("workspaces").doc(workspaceId);
  const [pages, databases, notebooks] = await Promise.all([
    ws.collection("pages").where("deletedAt", "<=", cutoff).get(),
    ws.collection("databases").where("deletedAt", "<=", cutoff).get(),
    ws.collection("notebooks").where("deletedAt", "<=", cutoff).get(),
  ]);
  return { pages: pages.docs, databases: databases.docs, notebooks: notebooks.docs };
}

export async function workspacesWithExpiredTrash(db: Firestore, cutoff: Date, now: number): Promise<string[]> {
  const ids = new Set<string>();
  const owner = (ref: DocumentReference) => ref.parent.parent?.id;
  try {
    const [pages, databases, notebooks, quarantine] = await Promise.all([
      db.collectionGroup("pages").where("deletedAt", "<=", cutoff).select().get(),
      db.collectionGroup("databases").where("deletedAt", "<=", cutoff).select().get(),
      db.collectionGroup("notebooks").where("deletedAt", "<=", cutoff).select().get(),
      db.collectionGroup("trashed_media").where("expiresAt", "<=", now).select().get(),
    ]);
    for (const snap of [...pages.docs, ...databases.docs, ...notebooks.docs, ...quarantine.docs]) {
      const id = owner(snap.ref);
      if (id) ids.add(id);
    }
    return [...ids];
  } catch {
    const all = await db.collection("workspaces").select().get();
    return all.docs.map((doc) => doc.id);
  }
}
