import "server-only";

import { FieldValue, type DocumentReference } from "firebase-admin/firestore";
import { adminAuth, adminBucket, adminDb, isAdminConfigured } from "@/lib/firebase/admin";
import { clearEvernoteConnection } from "@/lib/evernote/store";
import { readStoredToken, revokeGoogleToken, revokeNotionToken, settleWithin } from "@/lib/import/integration-disconnect";
import { workspacesOf as workspacesOfDb, type AccountWorkspaces } from "@/lib/account/workspaces";
import { exportPrefixOf } from "@/lib/account/export-paths";

export async function workspacesOf(uid: string): Promise<AccountWorkspaces> {
  return workspacesOfDb(adminDb(), uid);
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
  await db.collection("export_locks").doc(uid).delete().catch(() => undefined);
  await bucket.deleteFiles({ prefix: `users/${uid}/` }).catch(() => undefined);
  await bucket.deleteFiles({ prefix: exportPrefixOf(uid) }).catch(() => undefined);
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

export async function revokeSessions(uid: string): Promise<void> {
  await adminAuth().revokeRefreshTokens(uid);
}
