import "server-only";

import { FieldValue, type DocumentReference } from "firebase-admin/firestore";
import { adminAuth, adminDb, isAdminConfigured } from "@/lib/firebase/admin";
import type { SupportedLanguage } from "@/types/models";
import { defaultWorkspaceName } from "@/lib/i18n/site-metadata";
import { ApiError } from "./errors";

export interface AuthedUser {
  uid: string;
  email?: string;
  name?: string;
}

export async function requireUser(request: Request): Promise<AuthedUser> {
  if (!isAdminConfigured()) {
    throw new ApiError(
      503,
      "Firebase Admin não configurado. Defina FIREBASE_SERVICE_ACCOUNT_JSON."
    );
  }

  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) {
    throw new ApiError(401, "Login obrigatório");
  }

  try {
    const decoded = await adminAuth().verifyIdToken(header.slice(7));
    return { uid: decoded.uid, email: decoded.email, name: decoded.name };
  } catch {
    throw new ApiError(401, "Sessão inválida ou expirada");
  }
}

export function workspaceIdFor(uid: string): string {
  const envId = process.env.NEXT_PUBLIC_DEFAULT_WORKSPACE_ID;
  if (envId && envId !== "primary") return envId;
  return `ws_${uid}`;
}

export async function ensureWorkspace(
  user: AuthedUser,
  requestedId?: string,
  language: SupportedLanguage = "pt"
): Promise<string> {
  const workspaceId = requestedId || workspaceIdFor(user.uid);
  const db = adminDb();
  const wsRef = db.collection("workspaces").doc(workspaceId);
  const memberRef = wsRef.collection("members").doc(user.uid);

  await db.runTransaction(async (tx) => {
    const [ws, member] = await Promise.all([tx.get(wsRef), tx.get(memberRef)]);

    if (!ws.exists) {
      tx.set(wsRef, {
        id: workspaceId,
        name: defaultWorkspaceName(language, user.name),
        emoji: "🧠",
        language,
        ownerId: user.uid,
        memberIds: [user.uid],
        plan: "free",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      const data = ws.data() ?? {};
      const memberIds = (data.memberIds as string[] | undefined) ?? [];
      if (!memberIds.includes(user.uid) && data.ownerId !== user.uid) {
        throw new ApiError(403, "Você não é membro deste workspace");
      }
    }

    if (!member.exists) {
      const role = !ws.exists || ws.get("ownerId") === user.uid ? "owner" : "editor";
      tx.set(memberRef, {
        userId: user.uid,
        email: user.email ?? "",
        displayName: user.name ?? user.email ?? "Sem nome",
        photoURL: null,
        role,
        joinedAt: FieldValue.serverTimestamp(),
      });
    }
  });

  await removeLegacyInbox(wsRef);

  return workspaceId;
}

const LEGACY_INBOX_ID = "nb_inbox";

async function removeLegacyInbox(wsRef: DocumentReference) {
  const inboxRef = wsRef.collection("notebooks").doc(LEGACY_INBOX_ID);
  const inbox = await inboxRef.get();
  if (!inbox.exists) return;

  const [notebooks, pages] = await Promise.all([
    wsRef.collection("notebooks").get(),
    wsRef.collection("pages").where("notebookId", "==", LEGACY_INBOX_ID).get(),
  ]);

  const batch = adminDb().batch();
  for (const snap of notebooks.docs) {
    if (snap.id === LEGACY_INBOX_ID) continue;
    if ((snap.data().parentId as string | null | undefined) === LEGACY_INBOX_ID) {
      batch.update(snap.ref, { parentId: null, updatedAt: FieldValue.serverTimestamp() });
    }
  }
  for (const snap of pages.docs) {
    batch.update(snap.ref, { notebookId: null, updatedAt: FieldValue.serverTimestamp() });
  }
  batch.delete(inboxRef);
  await batch.commit();
}

export async function requireWorkspaceEditor(
  request: Request,
  workspaceId: string
): Promise<AuthedUser> {
  const user = await requireUser(request);
  const member = await adminDb()
    .collection("workspaces")
    .doc(workspaceId)
    .collection("members")
    .doc(user.uid)
    .get();

  if (!member.exists) {
    await ensureWorkspace(user, workspaceId);
    const again = await adminDb()
      .collection("workspaces")
      .doc(workspaceId)
      .collection("members")
      .doc(user.uid)
      .get();
    if (!again.exists) throw new ApiError(403, "Sem permissão neste workspace");
    return user;
  }

  const role = member.get("role") as string;
  if (!["owner", "admin", "editor"].includes(role)) {
    throw new ApiError(403, "Permissão insuficiente");
  }
  return user;
}
