import "server-only";

import { requireWorkspaceEditor } from "@/lib/api/session";
import { jsonError } from "@/lib/api/errors";
import { adminBucket, adminDb, isAdminConfigured } from "@/lib/firebase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

function extractStoragePath(input: unknown): string | null {
  if (typeof input !== "string" || !input.trim()) return null;
  const val = input.trim();
  if (val.startsWith("workspaces/") || val.startsWith("users/")) {
    return val;
  }
  if (val.includes("firebasestorage.googleapis.com") || val.includes("firebasestorage.app")) {
    const match = val.match(/\/o\/([^?]+)/);
    if (match && match[1]) {
      try {
        return decodeURIComponent(match[1]);
      } catch {
        return match[1];
      }
    }
  }
  return null;
}

function docIdForPath(path: string): string {
  return Buffer.from(path).toString("base64url");
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      workspaceId?: string;
      pageId?: string;
      storagePaths?: string[];
      action?: "quarantine" | "restore" | "unquarantine" | "purge_expired";
    };

    const { workspaceId, action = "quarantine" } = body;
    if (!workspaceId) {
      return Response.json({ error: "workspaceId é obrigatório" }, { status: 400 });
    }

    const user = await requireWorkspaceEditor(request, workspaceId);

    if (!isAdminConfigured()) {
      return Response.json({ ok: true, message: "Admin not configured" });
    }

    const db = adminDb();
    const bucket = adminBucket();
    const trashedCol = db.collection("workspaces").doc(workspaceId).collection("trashed_media");

    if (action === "purge_expired") {
      const now = Date.now();
      const expiredSnap = await trashedCol.where("expiresAt", "<=", now).get();
      if (expiredSnap.empty) {
        return Response.json({ ok: true, purgedCount: 0 });
      }

      const pathsToDelete: string[] = [];
      const docsToDelete: FirebaseFirestore.DocumentReference[] = [];

      for (const doc of expiredSnap.docs) {
        const data = doc.data();
        const p = String(data.storagePath || "");
        if (p) {
          pathsToDelete.push(p);
        }
        docsToDelete.push(doc.ref);
      }

      await Promise.allSettled(
        pathsToDelete.map((p) =>
          bucket
            .file(p)
            .delete()
            .catch(() => {})
        )
      );

      for (let i = 0; i < docsToDelete.length; i += 400) {
        const batch = db.batch();
        for (const ref of docsToDelete.slice(i, i + 400)) {
          batch.delete(ref);
        }
        await batch.commit();
      }

      return Response.json({ ok: true, purgedCount: docsToDelete.length });
    }

    const rawList = Array.isArray(body.storagePaths) ? body.storagePaths : [];
    const validPaths: string[] = [];

    for (const item of rawList) {
      const parsed = extractStoragePath(item);
      if (!parsed) continue;
      const isWorkspaceFile = parsed.startsWith(`workspaces/${workspaceId}/`);
      const isUserFile = parsed.startsWith(`users/${user.uid}/`);
      if (isWorkspaceFile || isUserFile) {
        validPaths.push(parsed);
      }
    }

    if (validPaths.length === 0) {
      return Response.json({ ok: true, count: 0 });
    }

    const now = Date.now();
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    const expiresAt = now + THIRTY_DAYS_MS;

    const batch = db.batch();

    for (const path of validPaths) {
      const docRef = trashedCol.doc(docIdForPath(path));
      if (action === "restore" || action === "unquarantine") {
        batch.delete(docRef);
      } else {
        batch.set(
          docRef,
          {
            storagePath: path,
            pageId: body.pageId || null,
            markedForDeletionAt: now,
            expiresAt,
            userId: user.uid,
          },
          { merge: true }
        );
      }
    }

    await batch.commit();

    return Response.json({ ok: true, count: validPaths.length, action });
  } catch (error) {
    return jsonError(error);
  }
}
