import type { DocumentReference, Firestore } from "firebase-admin/firestore";

export interface AccountWorkspaces {
  owned: DocumentReference[];
  member: DocumentReference[];
}

export async function workspacesOf(db: Firestore, uid: string): Promise<AccountWorkspaces> {
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
