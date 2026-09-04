import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

if (!getApps().length) initializeApp();

export const db = getFirestore();
export const bucket = () => getStorage().bucket();

export const workspaceRef = (workspaceId: string) => db.collection("workspaces").doc(workspaceId);

export const pagesRef = (workspaceId: string) => workspaceRef(workspaceId).collection("pages");

export const databasesRef = (workspaceId: string) =>
  workspaceRef(workspaceId).collection("databases");

export const notebooksRef = (workspaceId: string) =>
  workspaceRef(workspaceId).collection("notebooks");

export const importJobRef = (workspaceId: string, jobId: string) =>
  workspaceRef(workspaceId).collection("import_jobs").doc(jobId);

export const integrationRef = (workspaceId: string, integrationId: string) =>
  workspaceRef(workspaceId).collection("integrations").doc(integrationId);

export const attachmentsRef = (workspaceId: string) =>
  workspaceRef(workspaceId).collection("attachments");

/** Throws unless the caller is a member of the workspace with a writing role. */
export async function assertWorkspaceEditor(workspaceId: string, uid: string): Promise<void> {
  const member = await workspaceRef(workspaceId).collection("members").doc(uid).get();
  if (!member.exists) throw new Error("permission-denied: not a workspace member");
  const role = member.get("role") as string;
  if (!["owner", "admin", "editor"].includes(role)) {
    throw new Error("permission-denied: insufficient role");
  }
}
