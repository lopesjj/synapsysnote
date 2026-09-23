import "server-only";

import { requireWorkspaceEditor } from "@/lib/api/session";
import { jsonError } from "@/lib/api/errors";
import { adminBucket, adminDb, isAdminConfigured } from "@/lib/firebase/admin";
import { extractStoragePath } from "@/lib/trash/purge-core";

export const runtime = "nodejs";
export const maxDuration = 60;

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
      if (parsed.startsWith(`workspaces/${workspaceId}/`) || parsed.startsWith(`users/${user.uid}/`)) {
        pathsToDelete.add(parsed);
      }
    }

    if (pathsToDelete.size === 0) {
      return Response.json({ ok: true, deletedCount: 0 });
    }

    if (isAdminConfigured()) {
      const bucket = adminBucket();
      await Promise.allSettled(
        Array.from(pathsToDelete).map((path) =>
          bucket
            .file(path)
            .delete({ ignoreNotFound: true })
            .catch(() => {})
        )
      );

      const db = adminDb();
      const attachmentsCol = db.collection("workspaces").doc(workspaceId).collection("attachments");
      const paths = [...pathsToDelete];
      for (let start = 0; start < paths.length; start += 30) {
        const snap = await attachmentsCol.where("storagePath", "in", paths.slice(start, start + 30)).get();
        if (snap.empty) continue;
        const batch = db.batch();
        for (const doc of snap.docs) batch.delete(doc.ref);
        await batch.commit();
      }
    }

    return Response.json({ ok: true, deletedCount: pathsToDelete.size });
  } catch (error) {
    return jsonError(error);
  }
}
