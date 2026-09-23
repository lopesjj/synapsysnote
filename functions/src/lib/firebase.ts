import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

if (!getApps().length) initializeApp();

export const db = getFirestore();
export const bucket = () => getStorage().bucket();

export async function assertWorkspaceEditor(workspaceId: string, uid: string): Promise<void> {
  const member = await db.collection("workspaces").doc(workspaceId).collection("members").doc(uid).get();
  if (!member.exists) throw new Error("permission-denied: not a workspace member");
  const role = member.get("role") as string;
  if (!["owner", "admin", "editor"].includes(role)) {
    throw new Error("permission-denied: insufficient role");
  }
}
