import "server-only";

import { FieldValue, type DocumentReference, type DocumentSnapshot } from "firebase-admin/firestore";
import { Zip, ZipDeflate, ZipPassThrough, strToU8 } from "fflate";
import { adminAuth, adminBucket, adminDb, isAdminConfigured } from "@/lib/firebase/admin";
import { clearEvernoteConnection } from "@/lib/evernote/store";
import { readStoredToken, revokeGoogleToken, revokeNotionToken, settleWithin } from "@/lib/import/integration-disconnect";
import { CARD_IMAGE_FIELDS, extractStoragePath, parseStoredBlocks } from "@/lib/trash/purge-core";

const SECRET_FIELDS = new Set(["accessTokenCipher", "refreshTokenCipher", "blocks"]);

function plain(value: unknown): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (Array.isArray(value)) return value.map(plain);
  if (typeof value === "object") {
    const maybe = value as { toDate?: () => Date; path?: string; latitude?: number };
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

function docData(snap: DocumentSnapshot): Record<string, unknown> {
  const data = snap.data() ?? {};
  const out = plain(data) as Record<string, unknown>;
  if (typeof data.blocksJson === "string") {
    delete out.blocksJson;
    out.blocks = parseStoredBlocks(data);
  }
  return { id: snap.id, ...out };
}

export interface AccountWorkspaces {
  owned: DocumentReference[];
  member: DocumentReference[];
}

export async function workspacesOf(uid: string): Promise<AccountWorkspaces> {
  const db = adminDb();
  const [byMember, byOwner] = await Promise.all([
    db.collection("workspaces").where("memberIds", "array-contains", uid).get(),
    db.collection("workspaces").where("ownerId", "==", uid).get(),
  ]);
  const owned = new Map<string, DocumentReference>();
  const member = new Map<string, DocumentReference>();
  for (const snap of [...byMember.docs, ...byOwner.docs]) {
    if (snap.get("ownerId") === uid) owned.set(snap.id, snap.ref);
    else member.set(snap.id, snap.ref);
  }
  const personal = db.collection("workspaces").doc(`ws_${uid}`);
  if (!owned.has(personal.id) && (await personal.get()).exists) owned.set(personal.id, personal);
  return { owned: [...owned.values()], member: [...member.values()] };
}

async function revokeIntegrations(workspace: DocumentReference) {
  const integrations = workspace.collection("integrations");
  const [notion, google] = await Promise.all([
    integrations.doc("notion").collection("secure").doc("token").get(),
    integrations.doc("google-docs").collection("secure").doc("token").get(),
  ]);
  await Promise.all([
    settleWithin(revokeNotionToken(readStoredToken(notion.get("accessTokenCipher")))),
    settleWithin(
      revokeGoogleToken(
        readStoredToken(google.get("refreshTokenCipher")) ?? readStoredToken(google.get("accessTokenCipher"))
      )
    ),
    settleWithin(clearEvernoteConnection(workspace.id)),
  ]);
}

export interface DeletionSummary {
  workspacesDeleted: string[];
  membershipsRemoved: string[];
}

export async function deleteAccount(uid: string): Promise<DeletionSummary> {
  if (!isAdminConfigured()) throw new Error("Firebase Admin não configurado.");
  const db = adminDb();
  const bucket = adminBucket();
  const { owned, member } = await workspacesOf(uid);

  const ownedTasks = owned.map(async (workspace) => {
    await revokeIntegrations(workspace).catch(() => undefined);
    await Promise.all([
      db.recursiveDelete(workspace).catch(() => undefined),
      bucket.deleteFiles({ prefix: `workspaces/${workspace.id}/` }).catch(() => undefined),
    ]);
  });

  const memberTasks = member.map(async (workspace) => {
    await Promise.all([
      workspace.collection("members").doc(uid).delete().catch(() => undefined),
      workspace.update({ memberIds: FieldValue.arrayRemove(uid) }).catch(() => undefined),
    ]);
  });

  await Promise.all([
    ...ownedTasks,
    ...memberTasks,
    db.recursiveDelete(db.collection("users").doc(uid)).catch(() => undefined),
    bucket.deleteFiles({ prefix: `users/${uid}/` }).catch(() => undefined),
    adminAuth()
      .deleteUser(uid)
      .catch((error: { code?: string }) => {
        if (error?.code !== "auth/user-not-found") throw error;
      }),
  ]);

  return {
    workspacesDeleted: owned.map((ref) => ref.id),
    membershipsRemoved: member.map((ref) => ref.id),
  };
}

async function collectionData(ref: FirebaseFirestore.CollectionReference) {
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
  const pages = pagesSnap.docs.map(docData);
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

export async function accountSnapshot(uid: string) {
  const db = adminDb();
  const [user, profile, accessLogs, workspaces] = await Promise.all([
    adminAuth().getUser(uid),
    db.collection("users").doc(uid).get(),
    db.collection("access_logs").where("uid", "==", uid).get(),
    workspacesOf(uid),
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

interface MediaItem {
  media?: { storagePath?: unknown; url?: unknown };
  children?: MediaItem[];
}

function collectBlockPaths(blocks: unknown[], add: (val: unknown) => void) {
  if (!Array.isArray(blocks)) return;
  for (const block of blocks as MediaItem[]) {
    if (block?.media) {
      add(block.media.storagePath);
      add(block.media.url);
    }
    if (block?.children?.length) {
      collectBlockPaths(block.children, add);
    }
  }
}

function extractActiveStoragePaths(
  workspaceId: string,
  pages: Array<Record<string, unknown>>,
  notebooks: Array<Record<string, unknown>>,
  databases: Array<Record<string, unknown>>,
  flashcards: Array<Record<string, unknown>>,
  quarantinedPaths: Set<string>
): Set<string> {
  const activePaths = new Set<string>();
  const prefix = `workspaces/${workspaceId}/`;

  const add = (val: unknown) => {
    const p = extractStoragePath(val);
    if (p && p.startsWith(prefix) && !quarantinedPaths.has(p)) {
      activePaths.add(p);
    }
  };

  for (const page of pages) {
    if (page.deletedAt || page.trashedWith) continue;
    add(page.coverUrl);
    add(page.icon);
    collectBlockPaths(parseStoredBlocks(page), add);
  }

  for (const notebook of notebooks) {
    if (notebook.deletedAt || notebook.trashedWith) continue;
    add(notebook.coverUrl);
    add(notebook.emoji);
  }

  for (const database of databases) {
    if (database.deletedAt || database.trashedWith) continue;
    add(database.icon);
    if (Array.isArray(database.rows)) {
      for (const row of database.rows as Array<{ values?: Record<string, unknown> }>) {
        if (!row.values) continue;
        for (const val of Object.values(row.values)) {
          if (!Array.isArray(val)) continue;
          for (const item of val) {
            if (item && typeof item === "object") {
              const entry = item as { storagePath?: unknown; url?: unknown };
              add(entry.storagePath);
              add(entry.url);
            }
          }
        }
      }
    }
  }

  for (const card of flashcards) {
    for (const field of CARD_IMAGE_FIELDS) {
      add(card[field]);
    }
  }

  for (const q of quarantinedPaths) {
    activePaths.delete(q);
  }

  return activePaths;
}

export function workspaceExportStream(workspaceId: string, uid: string): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let failed = false;
      const zip = new Zip((error, chunk, final) => {
        if (failed) return;
        if (error) {
          failed = true;
          controller.error(error);
          return;
        }
        controller.enqueue(chunk);
        if (final) controller.close();
      });
      try {
        const db = adminDb();
        const wsRef = db.collection("workspaces").doc(workspaceId);
        const wsSnap = await wsRef.get();
        if (!wsSnap.exists) {
          throw new Error("Workspace não encontrado");
        }
        const memberIds = (wsSnap.get("memberIds") as string[]) || [];
        const ownerId = wsSnap.get("ownerId") as string;
        if (ownerId !== uid && !memberIds.includes(uid)) {
          throw new Error("Acesso não autorizado ao workspace");
        }

        const info = new ZipPassThrough("synapsys-backup-info.txt");
        zip.add(info);
        info.push(
          strToU8(
            `Synapsys Workspace Backup\nWorkspace: ${workspaceId}\nData: ${new Date().toISOString()}\n`
          ),
          true
        );

        const wsData = await workspaceData(wsRef, uid, true);
        const quarantinedPaths = new Set<string>();
        for (const item of (wsData.trashedMedia || []) as Array<Record<string, unknown>>) {
          if (typeof item.storagePath === "string") {
            quarantinedPaths.add(item.storagePath);
          }
          if (typeof item.url === "string") {
            const p = extractStoragePath(item.url);
            if (p) quarantinedPaths.add(p);
          }
        }

        const activePages = (wsData.pages || []).filter((p) => !p.deletedAt && !p.trashedWith);
        const activeNotebooks = (wsData.notebooks || []).filter((n) => !n.deletedAt && !n.trashedWith);
        const activeDatabases = (wsData.databases || []).filter((d) => !(d as Record<string, unknown>).deletedAt && !(d as Record<string, unknown>).trashedWith);
        const activePageIds = new Set(activePages.map((p) => String(p.id)));
        const activeFlashcards = (wsData.flashcards || []).filter((f) => !f.pageId || activePageIds.has(String(f.pageId)));

        const activeStoragePaths = extractActiveStoragePaths(
          workspaceId,
          activePages,
          activeNotebooks,
          activeDatabases,
          activeFlashcards,
          quarantinedPaths
        );

        const bucket = adminBucket();
        const prefix = `workspaces/${workspaceId}/`;

        const filesManifest: Array<{
          storagePath: string;
          archivePath: string;
          name: string;
          mimeType: string;
          sizeBytes: number;
        }> = [];

        for (const storagePath of activeStoragePaths) {
          if (quarantinedPaths.has(storagePath)) continue;
          const relative = storagePath.startsWith(prefix) ? storagePath.slice(prefix.length) : storagePath;
          const name = storagePath.split("/").pop() || relative;
          filesManifest.push({
            storagePath,
            archivePath: `files/${relative}`,
            name,
            mimeType: "application/octet-stream",
            sizeBytes: 0,
          });
        }

        const workspacePayload = {
          synapsysFormat: "synapsys-workspace-v1",
          version: "1.0",
          exportedAt: new Date().toISOString(),
          workspace: wsData.workspace,
          notebooks: activeNotebooks,
          pages: activePages,
          databases: activeDatabases,
          flashcards: activeFlashcards,
          files: filesManifest,
        };

        const json = new ZipDeflate("synapsys-workspace.json", { level: 6 });
        zip.add(json);
        json.push(strToU8(JSON.stringify(workspacePayload)), true);

        const pool = 25;
        let fileIdx = 0;
        async function downloadWorker() {
          while (fileIdx < filesManifest.length && !failed) {
            const target = filesManifest[fileIdx++];
            if (!target) break;
            try {
              const file = bucket.file(target.storagePath);
              const [content] = await file.download();
              if (content && !failed) {
                const entry = new ZipPassThrough(target.archivePath);
                zip.add(entry);
                entry.push(new Uint8Array(content.buffer, content.byteOffset, content.byteLength), true);
              }
            } catch {}
          }
        }

        await Promise.all(Array.from({ length: pool }, () => downloadWorker()));
        zip.end();
      } catch (error) {
        failed = true;
        zip.terminate();
        controller.error(error);
      }
    },
  });
}

export function accountExportStream(uid: string, targetWorkspaceId?: string): ReadableStream<Uint8Array> {
  if (targetWorkspaceId) {
    return workspaceExportStream(targetWorkspaceId, uid);
  }
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let failed = false;
      const zip = new Zip((error, chunk, final) => {
        if (failed) return;
        if (error) {
          failed = true;
          controller.error(error);
          return;
        }
        controller.enqueue(chunk);
        if (final) controller.close();
      });
      try {
        const info = new ZipPassThrough("synapsys-backup-info.txt");
        zip.add(info);
        info.push(
          strToU8(
            `Synapsys Account Backup\nUser: ${uid}\nData: ${new Date().toISOString()}\n`
          ),
          true
        );

        const snapshot = await accountSnapshot(uid);
        const primaryWorkspace = snapshot.workspaces[0];
        const primaryId = String(primaryWorkspace?.workspace?.id || snapshot.ownedWorkspaceIds[0] || `ws_${uid}`);

        const quarantinedPaths = new Set<string>();
        for (const item of (primaryWorkspace?.trashedMedia || []) as Array<Record<string, unknown>>) {
          if (typeof item.storagePath === "string") {
            quarantinedPaths.add(item.storagePath);
          }
          if (typeof item.url === "string") {
            const p = extractStoragePath(item.url);
            if (p) quarantinedPaths.add(p);
          }
        }

        const activePages = (primaryWorkspace?.pages || []).filter((p) => !p.deletedAt && !p.trashedWith);
        const activeNotebooks = (primaryWorkspace?.notebooks || []).filter((n) => !n.deletedAt && !n.trashedWith);
        const activeDatabases = (primaryWorkspace?.databases || []).filter((d) => !(d as Record<string, unknown>).deletedAt && !(d as Record<string, unknown>).trashedWith);
        const activePageIds = new Set(activePages.map((p) => String(p.id)));
        const activeFlashcards = (primaryWorkspace?.flashcards || []).filter((f) => !f.pageId || activePageIds.has(String(f.pageId)));

        const activeStoragePaths = extractActiveStoragePaths(
          primaryId,
          activePages,
          activeNotebooks,
          activeDatabases,
          activeFlashcards,
          quarantinedPaths
        );

        const bucket = adminBucket();

        const filesManifest: Array<{
          storagePath: string;
          archivePath: string;
          name: string;
          mimeType: string;
          sizeBytes: number;
        }> = [];

        for (const storagePath of activeStoragePaths) {
          if (quarantinedPaths.has(storagePath)) continue;
          const archivePath = storagePath.startsWith(`workspaces/${primaryId}/`)
            ? `files/${storagePath.slice(`workspaces/${primaryId}/`.length)}`
            : `arquivos/${storagePath}`;
          filesManifest.push({
            storagePath,
            archivePath,
            name: storagePath.split("/").pop() || storagePath,
            mimeType: "application/octet-stream",
            sizeBytes: 0,
          });
        }

        const workspacePayload = {
          synapsysFormat: "synapsys-workspace-v1",
          version: "1.0",
          exportedAt: new Date().toISOString(),
          workspace: primaryWorkspace?.workspace || { id: primaryId, name: "Workspace" },
          notebooks: activeNotebooks,
          pages: activePages,
          databases: activeDatabases,
          flashcards: activeFlashcards,
          account: snapshot.account,
          profile: snapshot.profile,
          accessLogs: snapshot.accessLogs,
          files: filesManifest,
        };

        const wsJson = new ZipDeflate("synapsys-workspace.json", { level: 6 });
        zip.add(wsJson);
        wsJson.push(strToU8(JSON.stringify(workspacePayload)), true);

        const legacyJson = new ZipDeflate("synapsys-dados.json", { level: 6 });
        zip.add(legacyJson);
        legacyJson.push(strToU8(JSON.stringify(snapshot)), true);

        const pool = 25;
        let fileIdx = 0;
        async function downloadWorker() {
          while (fileIdx < filesManifest.length && !failed) {
            const target = filesManifest[fileIdx++];
            if (!target) break;
            try {
              const file = bucket.file(target.storagePath);
              const [content] = await file.download();
              if (content && !failed) {
                const entry = new ZipPassThrough(target.archivePath);
                zip.add(entry);
                entry.push(new Uint8Array(content.buffer, content.byteOffset, content.byteLength), true);
              }
            } catch {}
          }
        }

        await Promise.all(Array.from({ length: pool }, () => downloadWorker()));
        zip.end();
      } catch (error) {
        failed = true;
        zip.terminate();
        controller.error(error);
      }
    },
  });
}

export async function revokeSessions(uid: string): Promise<void> {
  await adminAuth().revokeRefreshTokens(uid);
  if (isAdminConfigured()) {
    await adminDb()
      .collection("users")
      .doc(uid)
      .set({ sessionRevokedAt: Date.now() }, { merge: true })
      .catch((error) => {
        console.error("[account-server] Falha ao atualizar sessionRevokedAt:", error);
      });
  }
}
