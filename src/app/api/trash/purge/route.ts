import "server-only";

import { requireWorkspaceEditor } from "@/lib/api/session";
import { jsonError } from "@/lib/api/errors";
import { adminBucket, adminDb, isAdminConfigured } from "@/lib/firebase/admin";
import type { AppBlock } from "@/types/models";

export const runtime = "nodejs";
export const maxDuration = 120;

function extractStoragePaths(blocks: unknown[]): string[] {
  const paths: string[] = [];
  const walk = (list: unknown[]) => {
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const b = item as AppBlock;
      if (b.media?.storagePath) {
        paths.push(b.media.storagePath);
      }
      if (Array.isArray(b.children) && b.children.length) {
        walk(b.children);
      }
    }
  };
  walk(blocks);
  return paths;
}

async function deletePageStorageAndDoc(
  workspaceId: string,
  pageDoc: FirebaseFirestore.DocumentSnapshot
) {
  const pageId = pageDoc.id;
  const pageData = pageDoc.data() ?? {};
  const blocks = (pageData.blocks ?? []) as unknown[];

  const storagePaths = new Set<string>(extractStoragePaths(blocks));

  const versionsSnap = await pageDoc.ref.collection("versions").get();
  for (const vDoc of versionsSnap.docs) {
    const vBlocks = (vDoc.data().blocks ?? []) as unknown[];
    for (const p of extractStoragePaths(vBlocks)) {
      storagePaths.add(p);
    }
  }

  if (isAdminConfigured()) {
    const bucket = adminBucket();

    await Promise.allSettled([
      bucket.deleteFiles({ prefix: `workspaces/${workspaceId}/uploads/${pageId}/` }),
      bucket.deleteFiles({ prefix: `workspaces/${workspaceId}/audio/${pageId}/` }),
      ...Array.from(storagePaths).map((p) => bucket.file(p).delete()),
    ]);
  }

  const batch = adminDb().batch();
  for (const vDoc of versionsSnap.docs) {
    batch.delete(vDoc.ref);
  }
  batch.delete(pageDoc.ref);
  await batch.commit();
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      workspaceId?: string;
      pageId?: string;
      emptyAll?: boolean;
    };

    const { workspaceId, pageId, emptyAll } = body;
    if (!workspaceId) {
      return Response.json({ error: "workspaceId é obrigatório" }, { status: 400 });
    }

    await requireWorkspaceEditor(request, workspaceId);
    const db = adminDb();
    const wsRef = db.collection("workspaces").doc(workspaceId);
    const pagesCol = wsRef.collection("pages");
    const databasesCol = wsRef.collection("databases");

    if (emptyAll) {
      const trashedPages = await pagesCol.where("deletedAt", "!=", null).get();
      for (const pDoc of trashedPages.docs) {
        await deletePageStorageAndDoc(workspaceId, pDoc);
      }

      const trashedDatabases = await databasesCol.where("deletedAt", "!=", null).get();
      for (const dDoc of trashedDatabases.docs) {
        const rowsSnap = await dDoc.ref.collection("rows").get();
        if (isAdminConfigured()) {
          const bucket = adminBucket();
          for (const rowDoc of rowsSnap.docs) {
            const values = rowDoc.data()?.values ?? {};
            for (const val of Object.values(values)) {
              if (Array.isArray(val)) {
                for (const item of val) {
                  if (item?.storagePath && typeof item.storagePath === "string") {
                    await bucket.file(item.storagePath).delete().catch(() => {});
                  }
                }
              }
            }
          }
        }
        const batch = db.batch();
        for (const rowDoc of rowsSnap.docs) {
          batch.delete(rowDoc.ref);
        }
        batch.delete(dDoc.ref);
        await batch.commit();
      }

      return Response.json({ ok: true, purgedPages: trashedPages.size, purgedDatabases: trashedDatabases.size });
    }

    if (pageId) {
      const [targetDoc, descendantsSnap] = await Promise.all([
        pagesCol.doc(pageId).get(),
        pagesCol.where("path", "array-contains", pageId).get(),
      ]);

      const docsToPurge: FirebaseFirestore.DocumentSnapshot[] = descendantsSnap.docs.slice();
      if (targetDoc.exists) {
        docsToPurge.unshift(targetDoc);
      }

      for (const doc of docsToPurge) {
        await deletePageStorageAndDoc(workspaceId, doc);
      }

      return Response.json({ ok: true, purgedCount: docsToPurge.length });
    }

    return Response.json({ error: "pageId ou emptyAll deve ser fornecido" }, { status: 400 });
  } catch (error) {
    return jsonError(error);
  }
}
