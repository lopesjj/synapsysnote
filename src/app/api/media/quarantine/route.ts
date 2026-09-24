import "server-only";

import { requireWorkspaceEditor } from "@/lib/api/session";
import { jsonError } from "@/lib/api/errors";
import { adminDb, isAdminConfigured } from "@/lib/firebase/admin";
import { extractStoragePath, quarantineDocId } from "@/lib/trash/purge-core";
import { QUARANTINE_RETENTION_MS } from "@/lib/trash/retention";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      workspaceId?: string;
      pageId?: string;
      storagePaths?: string[];
      action?: "quarantine" | "restore" | "unquarantine";
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
    const trashedCol = db.collection("workspaces").doc(workspaceId).collection("trashed_media");

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
    const expiresAt = now + QUARANTINE_RETENTION_MS;

    for (let start = 0; start < validPaths.length; start += 400) {
      const batch = db.batch();
      for (const path of validPaths.slice(start, start + 400)) {
        const docRef = trashedCol.doc(quarantineDocId(path));
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
    }

    return Response.json({ ok: true, count: validPaths.length, action });
  } catch (error) {
    return jsonError(error);
  }
}
