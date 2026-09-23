import "server-only";

import { FieldValue, type DocumentReference, type DocumentSnapshot } from "firebase-admin/firestore";
import { Zip, ZipDeflate, ZipPassThrough, strToU8 } from "fflate";
import { adminAuth, adminBucket, adminDb, isAdminConfigured } from "@/lib/firebase/admin";
import { clearEvernoteConnection } from "@/lib/evernote/store";
import { readStoredToken, revokeGoogleToken, revokeNotionToken, settleWithin } from "@/lib/import/integration-disconnect";
import { parseStoredBlocks } from "@/lib/trash/purge-core";

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

  for (const workspace of owned) {
    await revokeIntegrations(workspace);
    await db.recursiveDelete(workspace);
    await bucket.deleteFiles({ prefix: `workspaces/${workspace.id}/` }).catch(() => undefined);
  }

  for (const workspace of member) {
    await workspace.collection("members").doc(uid).delete().catch(() => undefined);
    await workspace.update({ memberIds: FieldValue.arrayRemove(uid) }).catch(() => undefined);
  }

  await db.recursiveDelete(db.collection("users").doc(uid));
  await bucket.deleteFiles({ prefix: `users/${uid}/` }).catch(() => undefined);
  await adminAuth()
    .deleteUser(uid)
    .catch((error: { code?: string }) => {
      if (error?.code !== "auth/user-not-found") throw error;
    });

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

export function accountExportStream(uid: string): ReadableStream<Uint8Array> {
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
        const snapshot = await accountSnapshot(uid);
        const json = new ZipDeflate("synapsys-dados.json", { level: 6 });
        zip.add(json);
        json.push(strToU8(JSON.stringify(snapshot, null, 2)), true);

        const bucket = adminBucket();
        const prefixes = [`users/${uid}/`, ...snapshot.ownedWorkspaceIds.map((id) => `workspaces/${id}/`)];
        for (const prefix of prefixes) {
          const [files] = await bucket.getFiles({ prefix });
          for (const file of files) {
            if (file.name.endsWith("/")) continue;
            const [content] = await file.download();
            const entry = new ZipPassThrough(`arquivos/${file.name}`);
            zip.add(entry);
            entry.push(new Uint8Array(content.buffer, content.byteOffset, content.byteLength), true);
          }
        }
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
}
