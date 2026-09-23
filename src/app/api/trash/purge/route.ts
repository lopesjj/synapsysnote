import "server-only";

import { Timestamp } from "firebase-admin/firestore";
import { requireWorkspaceEditor } from "@/lib/api/session";
import { ApiError, jsonError } from "@/lib/api/errors";
import { isCrossSiteRequest } from "@/lib/api/request-origin";
import { adminDb } from "@/lib/firebase/admin";
import { TRASH_RETENTION_MS, purgeExpiredQuarantine, purgeItems } from "@/lib/trash/purge-server";

export const runtime = "nodejs";
export const maxDuration = 120;

type Snap = FirebaseFirestore.DocumentSnapshot;

interface PurgeBody {
  workspaceId?: string;
  pageId?: string;
  notebookId?: string;
  databaseId?: string;
  emptyAll?: boolean;
  purgeExpired?: boolean;
}

function unique(snaps: Snap[]): Snap[] {
  const byId = new Map<string, Snap>();
  for (const snap of snaps) if (snap.exists) byId.set(snap.ref.path, snap);
  return [...byId.values()];
}

export async function POST(request: Request) {
  try {
    if (isCrossSiteRequest(request)) throw new ApiError(403, "Origem não permitida");

    const body = (await request.json().catch(() => ({}))) as PurgeBody;
    const { workspaceId } = body;
    if (!workspaceId) throw new ApiError(400, "workspaceId é obrigatório");

    await requireWorkspaceEditor(request, workspaceId);
    const ws = adminDb().collection("workspaces").doc(workspaceId);
    const pages = ws.collection("pages");
    const databases = ws.collection("databases");
    const notebooks = ws.collection("notebooks");

    if (body.purgeExpired) {
      // `deletedAt` e gravado com serverTimestamp(): a comparacao precisa ser
      // com Timestamp, porque o Firestore nao compara Timestamp com numero.
      const cutoff = Timestamp.fromMillis(Date.now() - TRASH_RETENTION_MS);
      const [expiredPages, expiredDatabases, expiredNotebooks] = await Promise.all([
        pages.where("deletedAt", "<=", cutoff).get(),
        databases.where("deletedAt", "<=", cutoff).get(),
        notebooks.where("deletedAt", "<=", cutoff).get(),
      ]);
      const purged = await purgeItems(workspaceId, {
        pages: expiredPages.docs,
        databases: expiredDatabases.docs,
        notebooks: expiredNotebooks.docs,
      });
      const quarantined = await purgeExpiredQuarantine(workspaceId);
      return Response.json({ ok: true, purged, quarantined });
    }

    if (body.emptyAll) {
      const [trashedPages, trashedDatabases, trashedNotebooks] = await Promise.all([
        pages.where("deletedAt", "!=", null).get(),
        databases.where("deletedAt", "!=", null).get(),
        notebooks.where("deletedAt", "!=", null).get(),
      ]);
      const purged = await purgeItems(workspaceId, {
        pages: trashedPages.docs,
        databases: trashedDatabases.docs,
        notebooks: trashedNotebooks.docs,
      });
      const quarantined = await purgeExpiredQuarantine(workspaceId);
      return Response.json({ ok: true, purged, quarantined });
    }

    if (body.notebookId) {
      const notebook = await notebooks.doc(body.notebookId).get();
      if (!notebook.exists || !notebook.get("deletedAt")) {
        throw new ApiError(409, "O caderno não está na lixeira");
      }
      // Sai o caderno e tudo o que foi para a lixeira junto com ele.
      const [withPages, withDatabases, withNotebooks] = await Promise.all([
        pages.where("trashedWith", "==", body.notebookId).get(),
        databases.where("trashedWith", "==", body.notebookId).get(),
        notebooks.where("trashedWith", "==", body.notebookId).get(),
      ]);
      const purged = await purgeItems(workspaceId, {
        pages: withPages.docs.filter((snap) => snap.get("deletedAt")),
        databases: withDatabases.docs.filter((snap) => snap.get("deletedAt")),
        notebooks: unique([notebook, ...withNotebooks.docs.filter((snap) => snap.get("deletedAt"))]),
      });
      return Response.json({ ok: true, purged });
    }

    if (body.databaseId) {
      const database = await databases.doc(body.databaseId).get();
      if (!database.exists || !database.get("deletedAt")) {
        throw new ApiError(409, "A base não está na lixeira");
      }
      const purged = await purgeItems(workspaceId, { pages: [], databases: [database], notebooks: [] });
      return Response.json({ ok: true, purged });
    }

    if (body.pageId) {
      const [target, descendants, directChildren] = await Promise.all([
        pages.doc(body.pageId).get(),
        pages.where("path", "array-contains", body.pageId).get(),
        pages.where("parentPageId", "==", body.pageId).get(),
      ]);
      if (!target.exists || !target.get("deletedAt")) {
        throw new ApiError(409, "A nota não está na lixeira");
      }
      // Subnotas que ja foram restauradas continuam vivas.
      const trashed = unique([
        target,
        ...descendants.docs.filter((snap) => snap.get("deletedAt")),
        ...directChildren.docs.filter((snap) => snap.get("deletedAt")),
      ]);
      const purged = await purgeItems(workspaceId, { pages: trashed, databases: [], notebooks: [] });
      return Response.json({ ok: true, purged });
    }

    throw new ApiError(400, "Informe o que excluir");
  } catch (error) {
    return jsonError(error);
  }
}
