import archiver from "archiver";
import type { Readable, Writable } from "node:stream";
import { finished } from "node:stream/promises";
import type { Auth } from "firebase-admin/auth";
import type { CollectionReference, DocumentData, DocumentReference, DocumentSnapshot, Firestore } from "firebase-admin/firestore";
import { workspacesOf } from "./workspaces";
import { EXPORT_PREFIX, EXPORT_RETENTION_MS } from "./export-paths";

export { EXPORT_PREFIX, EXPORT_RETENTION_MS, exportPrefixOf } from "./export-paths";

export interface ExportFile {
  name: string;
  createReadStream(): Readable;
}

export interface ExportBucket {
  getFiles(options: { prefix: string }): Promise<[ExportFile[], ...unknown[]]>;
}

export interface ExportDeps {
  db: Firestore;
  auth: Auth;
  bucket: ExportBucket;
}

export interface ExportSummary {
  files: number;
  bytes: number;
}


export interface ExportCleanupBucket {
  getFiles(options: { prefix: string }): Promise<
    [Array<{ metadata: { timeCreated?: string | number }; delete(options?: { ignoreNotFound?: boolean }): Promise<unknown> }>, ...unknown[]]
  >;
}

export async function purgeOldExports(bucket: ExportCleanupBucket, now = Date.now()): Promise<number> {
  const [files] = await bucket.getFiles({ prefix: EXPORT_PREFIX });
  const expired = files.filter((file) => {
    const created = Date.parse(String(file.metadata.timeCreated ?? ""));
    return Number.isFinite(created) && created < now - EXPORT_RETENTION_MS;
  });
  await Promise.allSettled(expired.map((file) => file.delete({ ignoreNotFound: true })));
  return expired.length;
}

const SECRET_FIELDS = new Set(["accessTokenCipher", "refreshTokenCipher", "blocks"]);

function plain(value: unknown): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (Array.isArray(value)) return value.map(plain);
  if (typeof value === "object") {
    const maybe = value as { toDate?: () => Date; path?: string };
    if (typeof maybe.toDate === "function") return maybe.toDate().toISOString();
    if (typeof maybe.path === "string" && "firestore" in (value as object)) return maybe.path;
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_FIELDS.has(key)) continue;
      out[key] = plain(nested);
    }
    return out;
  }
  return value;
}

function storedBlocks(data: DocumentData): unknown[] {
  if (typeof data.blocksJson === "string") {
    try {
      const parsed = JSON.parse(data.blocksJson);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
  }
  return Array.isArray(data.blocks) ? data.blocks : [];
}

function docData(snap: DocumentSnapshot): Record<string, unknown> {
  const data = snap.data() ?? {};
  const out = plain(data) as Record<string, unknown>;
  if (typeof data.blocksJson === "string" || Array.isArray(data.blocks)) {
    delete out.blocksJson;
    out.blocks = storedBlocks(data);
  }
  return { id: snap.id, ...out };
}

async function collectionData(ref: CollectionReference) {
  const snap = await ref.get();
  return snap.docs.map(docData);
}

async function workspaceData(workspace: DocumentReference, uid: string, owner: boolean) {
  const base = docData(await workspace.get());
  if (!owner) {
    const self = await workspace.collection("members").doc(uid).get();
    return { workspace: base, membership: self.exists ? docData(self) : null };
  }
  const [pagesSnap, notebooks, databasesSnap, flashcards, importJobs, integrations, trashedMedia, members] =
    await Promise.all([
      workspace.collection("pages").get(),
      collectionData(workspace.collection("notebooks")),
      workspace.collection("databases").get(),
      collectionData(workspace.collection("flashcards")),
      collectionData(workspace.collection("import_jobs")),
      collectionData(workspace.collection("integrations")),
      collectionData(workspace.collection("trashed_media")),
      workspace.collection("members").doc(uid).get(),
    ]);
  const pages = await Promise.all(
    pagesSnap.docs.map(async (page) => ({
      ...docData(page),
      versions: await collectionData(page.ref.collection("versions")),
    }))
  );
  const databases = await Promise.all(
    databasesSnap.docs.map(async (database) => ({
      ...docData(database),
      rows: await collectionData(database.ref.collection("rows")),
    }))
  );
  return {
    workspace: base,
    membership: members.exists ? docData(members) : null,
    notebooks,
    pages,
    databases,
    flashcards,
    importJobs,
    integrations,
    trashedMedia,
  };
}

export async function accountSnapshot(deps: ExportDeps, uid: string) {
  const { db, auth } = deps;
  const [user, profile, accessLogs, workspaces] = await Promise.all([
    auth.getUser(uid),
    db.collection("users").doc(uid).get(),
    db.collection("access_logs").where("uid", "==", uid).get(),
    workspacesOf(db, uid),
  ]);
  const owned = await Promise.all(workspaces.owned.map((ref) => workspaceData(ref, uid, true)));
  const memberOf = await Promise.all(workspaces.member.map((ref) => workspaceData(ref, uid, false)));
  return {
    exportedAt: new Date().toISOString(),
    account: {
      uid: user.uid,
      email: user.email ?? null,
      emailVerified: user.emailVerified,
      displayName: user.displayName ?? null,
      phoneNumber: user.phoneNumber ?? null,
      providers: user.providerData.map((provider) => provider.providerId),
      createdAt: user.metadata.creationTime,
      lastSignInAt: user.metadata.lastSignInTime,
    },
    profile: profile.exists ? docData(profile) : null,
    accessLogs: accessLogs.docs.map(docData),
    workspaces: owned,
    memberships: memberOf,
    ownedWorkspaceIds: workspaces.owned.map((ref) => ref.id),
  };
}

function appendAndWait(archive: archiver.Archiver, source: Readable | Buffer, name: string) {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      archive.off("entry", onEntry);
      archive.off("error", onError);
      if (!Buffer.isBuffer(source)) source.off("error", onError);
    };
    const onEntry = () => {
      cleanup();
      resolve();
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    archive.once("entry", onEntry);
    archive.once("error", onError);
    if (!Buffer.isBuffer(source)) source.once("error", onError);
    archive.append(source, { name, date: new Date() });
  });
}

export async function writeAccountExport(deps: ExportDeps, uid: string, out: Writable): Promise<ExportSummary> {
  const archive = archiver("zip", { zlib: { level: 6 } });
  let files = 0;
  archive.on("warning", () => undefined);
  archive.pipe(out);

  try {
    const snapshot = await accountSnapshot(deps, uid);
    await appendAndWait(archive, Buffer.from(JSON.stringify(snapshot, null, 2), "utf8"), "synapsys-dados.json");

    const prefixes = [`users/${uid}/`, ...snapshot.ownedWorkspaceIds.map((id) => `workspaces/${id}/`)];
    for (const prefix of prefixes) {
      const [list] = await deps.bucket.getFiles({ prefix });
      for (const file of list) {
        if (file.name.endsWith("/")) continue;
        await appendAndWait(archive, file.createReadStream(), `arquivos/${file.name}`);
        files += 1;
      }
    }
    await Promise.all([archive.finalize(), finished(out)]);
    return { files, bytes: archive.pointer() };
  } catch (error) {
    archive.abort();
    out.destroy(error as Error);
    throw error;
  }
}
