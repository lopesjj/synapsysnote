import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb, isAdminConfigured } from "@/lib/firebase/admin";
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

/**
 * Creates the personal workspace + owner membership + first notebook when they
 * do not exist yet. Used by both the bootstrap route and the Notion import
 * routes so a first login never hits a permission-denied from the rules.
 */
export async function ensureWorkspace(user: AuthedUser, requestedId?: string): Promise<string> {
  const workspaceId = requestedId || workspaceIdFor(user.uid);
  const db = adminDb();
  const wsRef = db.collection("workspaces").doc(workspaceId);
  const memberRef = wsRef.collection("members").doc(user.uid);

  await db.runTransaction(async (tx) => {
    const [ws, member] = await Promise.all([tx.get(wsRef), tx.get(memberRef)]);

    if (!ws.exists) {
      tx.set(wsRef, {
        id: workspaceId,
        name: user.name ? `Workspace de ${user.name.split(" ")[0]}` : "Meu workspace",
        emoji: "🧠",
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

  const notebooks = await wsRef.collection("notebooks").limit(1).get();
  if (notebooks.empty) {
    const notebookId = "nb_inbox";
    await wsRef.collection("notebooks").doc(notebookId).set({
      id: notebookId,
      name: "Caixa de entrada",
      emoji: "📥",
      color: "#0E7490",
      order: 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  return workspaceId;
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
    // First call after sign-in: provision then retry.
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
