import "server-only";

import { requireWorkspaceEditor } from "@/lib/api/session";
import { jsonError } from "@/lib/api/errors";
import { adminBucket, adminDb, isAdminConfigured } from "@/lib/firebase/admin";
import type { AppBlock } from "@/types/models";

export const runtime = "nodejs";
export const maxDuration = 120;

function extractStoragePathFromUrl(url: unknown): string | null {
  if (typeof url !== "string") return null;
  if (!url.includes("firebasestorage.googleapis.com") && !url.includes("firebasestorage.app")) {
    if (url.startsWith("workspaces/") || url.startsWith("users/")) return url;
    return null;
  }
  try {
    const match = url.match(/\/o\/([^?]+)/);
    if (match && match[1]) {
      return decodeURIComponent(match[1]);
    }
  } catch {}
  return null;
}

function extractStoragePaths(blocks: unknown[]): string[] {
  const paths: string[] = [];
  const walk = (list: unknown[]) => {
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const b = item as AppBlock;
      if (b.media?.storagePath) {
        paths.push(b.media.storagePath);
      }
      if (b.media?.url) {
        const p = extractStoragePathFromUrl(b.media.url);
        if (p) paths.push(p);
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
  let blocks = (pageData.blocks ?? []) as unknown[];
  if (!blocks.length && typeof pageData.blocksJson === "string") {
    try {
      const parsed = JSON.parse(pageData.blocksJson);
      if (Array.isArray(parsed)) blocks = parsed;
    } catch {}
  }

  const storagePaths = new Set<string>(extractStoragePaths(blocks));

  if (pageData.coverUrl) {
    const p = extractStoragePathFromUrl(pageData.coverUrl);
    if (p) storagePaths.add(p);
  }
  if (pageData.icon) {
    const p = extractStoragePathFromUrl(pageData.icon);
    if (p) storagePaths.add(p);
  }

  const versionsSnap = await pageDoc.ref.collection("versions").get();
  for (const vDoc of versionsSnap.docs) {
    const vData = vDoc.data();
    let vBlocks = (vData.blocks ?? []) as unknown[];
    if (!vBlocks.length && typeof vData.blocksJson === "string") {
      try {
        const parsed = JSON.parse(vData.blocksJson);
        if (Array.isArray(parsed)) vBlocks = parsed;
      } catch {}
    }
    for (const p of extractStoragePaths(vBlocks)) {
      storagePaths.add(p);
    }
  }

  if (isAdminConfigured()) {
    const bucket = adminBucket();

    await Promise.allSettled([
      bucket.deleteFiles({ prefix: `workspaces/${workspaceId}/uploads/${pageId}/` }),
      bucket.deleteFiles({ prefix: `workspaces/${workspaceId}/audio/${pageId}/` }),
      ...Array.from(storagePaths).map((p) =>
        bucket
          .file(p)
          .delete()
          .catch(() => {})
      ),
    ]);
  }

  const db = adminDb();
  const trashedMediaSnap = await db
    .collection("workspaces")
    .doc(workspaceId)
    .collection("trashed_media")
    .where("pageId", "==", pageId)
    .get();

  const refsToDelete: FirebaseFirestore.DocumentReference[] = [
    ...versionsSnap.docs.map((v) => v.ref),
    ...trashedMediaSnap.docs.map((m) => m.ref),
    pageDoc.ref,
  ];

  for (let i = 0; i < refsToDelete.length; i += 400) {
    const batch = db.batch();
    for (const ref of refsToDelete.slice(i, i + 400)) {
      batch.delete(ref);
    }
    await batch.commit();
  }
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
      const pageDocs = trashedPages.docs;
      for (let i = 0; i < pageDocs.length; i += 5) {
        const chunk = pageDocs.slice(i, i + 5);
        await Promise.all(chunk.map((pDoc) => deletePageStorageAndDoc(workspaceId, pDoc)));
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
                  const storagePath =
                    item?.storagePath ||
                    (item?.url ? extractStoragePathFromUrl(item.url) : null);
                  if (storagePath && typeof storagePath === "string") {
                    await bucket.file(storagePath).delete().catch(() => {});
                  }
                }
              }
            }
          }
        }

        const refsToDelete = [...rowsSnap.docs.map((r) => r.ref), dDoc.ref];
        for (let i = 0; i < refsToDelete.length; i += 400) {
          const batch = db.batch();
          for (const ref of refsToDelete.slice(i, i + 400)) {
            batch.delete(ref);
          }
          await batch.commit();
        }
      }

      const trashedMediaCol = wsRef.collection("trashed_media");
      const expiredSnap = await trashedMediaCol.where("expiresAt", "<=", Date.now()).get();
      if (!expiredSnap.empty) {
        if (isAdminConfigured()) {
          const bucket = adminBucket();
          const expiredPaths: string[] = [];
          for (const doc of expiredSnap.docs) {
            const p = doc.data().storagePath;
            if (p && typeof p === "string") expiredPaths.push(p);
          }
          await Promise.allSettled(expiredPaths.map((p) => bucket.file(p).delete().catch(() => {})));
        }
        const batch = db.batch();
        for (const doc of expiredSnap.docs) batch.delete(doc.ref);
        await batch.commit();
      }

      return Response.json({ ok: true, purgedPages: trashedPages.size, purgedDatabases: trashedDatabases.size });
    }

    if (pageId) {
      const [targetDoc, descendantsSnap, directChildrenSnap] = await Promise.all([
        pagesCol.doc(pageId).get(),
        pagesCol.where("path", "array-contains", pageId).get(),
        pagesCol.where("parentPageId", "==", pageId).get(),
      ]);

      const seenIds = new Set<string>();
      const docsToPurge: FirebaseFirestore.DocumentSnapshot[] = [];

      if (targetDoc.exists) {
        docsToPurge.push(targetDoc);
        seenIds.add(targetDoc.id);
      }

      for (const d of descendantsSnap.docs) {
        if (!seenIds.has(d.id)) {
          seenIds.add(d.id);
          docsToPurge.push(d);
        }
      }

      for (const d of directChildrenSnap.docs) {
        if (!seenIds.has(d.id)) {
          seenIds.add(d.id);
          docsToPurge.push(d);
        }
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
