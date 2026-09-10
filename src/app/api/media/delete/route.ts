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

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      workspaceId?: string;
      storagePaths?: string[];
      urls?: string[];
    };

    const { workspaceId } = body;
    if (!workspaceId) {
      return Response.json({ error: "workspaceId é obrigatório" }, { status: 400 });
    }

    const user = await requireWorkspaceEditor(request, workspaceId);

    const rawList = [
      ...(Array.isArray(body.storagePaths) ? body.storagePaths : []),
      ...(Array.isArray(body.urls) ? body.urls : []),
    ];

    const pathsToDelete = new Set<string>();
    for (const item of rawList) {
      const parsed = extractStoragePath(item);
      if (!parsed) continue;

      const isWorkspaceFile = parsed.startsWith(`workspaces/${workspaceId}/`);
      const isUserFile = parsed.startsWith(`users/${user.uid}/`);

      if (isWorkspaceFile || isUserFile) {
        pathsToDelete.add(parsed);
      }
    }

    if (pathsToDelete.size === 0) {
      return Response.json({ ok: true, deletedCount: 0 });
    }

    if (isAdminConfigured()) {
      const bucket = adminBucket();
      await Promise.allSettled(
        Array.from(pathsToDelete).map((p) =>
          bucket
            .file(p)
            .delete()
            .catch(() => {})
        )
      );

      const db = adminDb();
      const attachmentsCol = db.collection("workspaces").doc(workspaceId).collection("attachments");
      for (const p of pathsToDelete) {
        const snap = await attachmentsCol.where("storagePath", "==", p).get();
        if (!snap.empty) {
          const batch = db.batch();
          for (const doc of snap.docs) {
            batch.delete(doc.ref);
          }
          await batch.commit();
        }
      }
    }

    return Response.json({ ok: true, deletedCount: pathsToDelete.size });
  } catch (error) {
    return jsonError(error);
  }
}
