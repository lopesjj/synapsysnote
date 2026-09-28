import { ApiError, jsonError } from "@/lib/api/errors";
import { isCrossSiteRequest } from "@/lib/api/request-origin";
import { requireUser } from "@/lib/api/session";
import { adminDb, isAdminConfigured } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";
export const maxDuration = 300;

interface RestorePageVersion {
  id: string;
  pageId: string;
  title: string;
  blocks?: unknown[];
  blocksJson?: string;
  authorId: string;
  label?: string;
  createdAt: number;
}

interface RestorePage {
  id: string;
  title?: string;
  icon?: string;
  coverUrl?: string | null;
  coverPosition?: number | null;
  notebookId?: string | null;
  parentPageId?: string | null;
  path?: string[];
  blocks?: unknown[];
  blocksJson?: string;
  plainText?: string;
  extractedOCRText?: string;
  transcriptText?: string;
  tags?: string[];
  outgoingLinks?: string[];
  backlinks?: string[];
  favorite?: boolean;
  archived?: boolean;
  deletedAt?: number | null;
  trashedWith?: string | null;
  order?: number;
  createdAt?: number;
  updatedAt?: number;
  createdBy?: string;
  updatedBy?: string;
  versions?: RestorePageVersion[];
}

interface RestoreNotebook {
  id: string;
  name: string;
  emoji?: string;
  color?: string;
  description?: string;
  coverUrl?: string | null;
  coverPosition?: number | null;
  parentId?: string | null;
  order?: number;
  deletedAt?: number | null;
  trashedWith?: string | null;
  createdAt?: number;
  updatedAt?: number;
}

interface RestoreDatabaseRow {
  id: string;
  values?: Record<string, unknown>;
  pageId?: string | null;
  order?: number;
  createdAt?: number;
  updatedAt?: number;
}

interface RestoreDatabase {
  id: string;
  name: string;
  icon?: string;
  description?: string;
  notebookId?: string | null;
  parentPageId?: string | null;
  properties?: unknown[];
  views?: unknown[];
  deletedAt?: number | null;
  trashedWith?: string | null;
  createdAt?: number;
  updatedAt?: number;
  rows?: RestoreDatabaseRow[];
}

interface RestoreFlashcard {
  id: string;
  pageId: string;
  notebookId?: string | null;
  pageTitle?: string;
  front: string;
  back: string;
  hint?: string;
  frontImageUrl?: string | null;
  frontImageStoragePath?: string | null;
  backImageUrl?: string | null;
  backImageStoragePath?: string | null;
  imageUrl?: string | null;
  imageStoragePath?: string | null;
  repetition?: number;
  interval?: number;
  easeFactor?: number;
  nextReviewDate?: number;
  lastReviewedAt?: number | null;
  createdAt?: number;
  updatedAt?: number;
  createdBy?: string;
}

interface RestorePayload {
  workspaceId: string;
  clean?: boolean;
  data: {
    workspace?: {
      name?: string;
      emoji?: string;
      plan?: string;
      language?: string;
    };
    notebooks?: RestoreNotebook[];
    pages?: RestorePage[];
    databases?: RestoreDatabase[];
    flashcards?: RestoreFlashcard[];
  };
}

async function commitBatches(
  db: FirebaseFirestore.Firestore,
  operations: Array<(batch: FirebaseFirestore.WriteBatch) => void>
) {
  const chunkSize = 350;
  for (let i = 0; i < operations.length; i += chunkSize) {
    const chunk = operations.slice(i, i + chunkSize);
    const batch = db.batch();
    for (const op of chunk) {
      op(batch);
    }
    await batch.commit();
  }
}

export async function POST(request: Request) {
  try {
    if (isCrossSiteRequest(request)) throw new ApiError(403, "Origem não permitida");
    if (!isAdminConfigured()) throw new ApiError(500, "Firebase Admin não configurado");

    const user = await requireUser(request);
    const payload = (await request.json()) as RestorePayload;

    const workspaceId = payload.workspaceId || `ws_${user.uid}`;
    const db = adminDb();
    const wsRef = db.collection("workspaces").doc(workspaceId);
    const wsSnap = await wsRef.get();

    if (wsSnap.exists) {
      const ownerId = wsSnap.get("ownerId") as string;
      const memberIds = (wsSnap.get("memberIds") as string[]) || [];
      if (ownerId !== user.uid && !memberIds.includes(user.uid)) {
        throw new ApiError(403, "Acesso não autorizado a este workspace");
      }
    }

    if (payload.clean && wsSnap.exists) {
      const collectionsToClean = ["pages", "notebooks", "databases", "flashcards"];
      for (const collName of collectionsToClean) {
        try {
          await db.recursiveDelete(wsRef.collection(collName));
        } catch {
          const subSnap = await wsRef.collection(collName).get();
          const deleteOps: Array<(b: FirebaseFirestore.WriteBatch) => void> = [];
          for (const doc of subSnap.docs) {
            deleteOps.push((b) => b.delete(doc.ref));
          }
          await commitBatches(db, deleteOps);
        }
      }
    }

    const wsData = payload.data.workspace || {};
    const now = Date.now();

    const writeOps: Array<(batch: FirebaseFirestore.WriteBatch) => void> = [];

    if (payload.data.workspace || !wsSnap.exists) {
      writeOps.push((batch) => {
        batch.set(
          wsRef,
          {
            id: workspaceId,
            name: wsData.name || (wsSnap.exists ? wsSnap.get("name") : "Meu Workspace"),
            emoji: wsData.emoji || (wsSnap.exists ? wsSnap.get("emoji") : "🧠"),
            ownerId: wsSnap.exists ? (wsSnap.get("ownerId") || user.uid) : user.uid,
            memberIds: wsSnap.exists ? Array.from(new Set([...((wsSnap.get("memberIds") as string[]) || []), user.uid])) : [user.uid],
            plan: wsSnap.exists ? (wsSnap.get("plan") || "free") : "free",
            language: wsData.language || (wsSnap.exists ? wsSnap.get("language") : "pt"),
            updatedAt: FieldValue.serverTimestamp(),
            ...(wsSnap.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
          },
          { merge: true }
        );
      });

      const memberRef = wsRef.collection("members").doc(user.uid);
      writeOps.push((batch) => {
        batch.set(
          memberRef,
          {
            userId: user.uid,
            email: user.email || "",
            displayName: user.name || user.email || "",
            role: "owner",
            joinedAt: now,
          },
          { merge: true }
        );
      });
    }

    const notebooks = payload.data.notebooks || [];
    for (const nb of notebooks) {
      if (!nb.id) continue;
      const ref = wsRef.collection("notebooks").doc(nb.id);
      writeOps.push((batch) => {
        batch.set(
          ref,
          {
            id: nb.id,
            name: nb.name || "Sem título",
            emoji: nb.emoji || "📁",
            color: nb.color || "default",
            description: nb.description || "",
            coverUrl: nb.coverUrl ?? null,
            coverPosition: nb.coverPosition ?? null,
            parentId: nb.parentId ?? null,
            order: typeof nb.order === "number" ? nb.order : 0,
            deletedAt: nb.deletedAt ?? null,
            trashedWith: nb.trashedWith ?? null,
            createdAt: nb.createdAt || now,
            updatedAt: nb.updatedAt || now,
          },
          { merge: true }
        );
      });
    }

    const pages = payload.data.pages || [];
    for (const page of pages) {
      if (!page.id) continue;
      const ref = wsRef.collection("pages").doc(page.id);
      writeOps.push((batch) => {
        batch.set(
          ref,
          {
            id: page.id,
            title: page.title || "",
            icon: page.icon || "📄",
            coverUrl: page.coverUrl ?? null,
            coverPosition: page.coverPosition ?? null,
            notebookId: page.notebookId ?? null,
            parentPageId: page.parentPageId ?? null,
            path: Array.isArray(page.path) ? page.path : [],
            blocks: Array.isArray(page.blocks) ? page.blocks : [],
            blocksJson: page.blocksJson ?? null,
            plainText: page.plainText || "",
            extractedOCRText: page.extractedOCRText || "",
            transcriptText: page.transcriptText || "",
            tags: Array.isArray(page.tags) ? page.tags : [],
            outgoingLinks: Array.isArray(page.outgoingLinks) ? page.outgoingLinks : [],
            backlinks: Array.isArray(page.backlinks) ? page.backlinks : [],
            favorite: Boolean(page.favorite),
            archived: Boolean(page.archived),
            deletedAt: page.deletedAt ?? null,
            trashedWith: page.trashedWith ?? null,
            order: typeof page.order === "number" ? page.order : 0,
            createdAt: page.createdAt || now,
            updatedAt: page.updatedAt || now,
            createdBy: page.createdBy || user.uid,
            updatedBy: user.uid,
          },
          { merge: true }
        );
      });

      if (Array.isArray(page.versions)) {
        for (const version of page.versions) {
          if (!version.id) continue;
          const vRef = ref.collection("versions").doc(version.id);
          writeOps.push((batch) => {
            batch.set(
              vRef,
              {
                id: version.id,
                pageId: page.id,
                title: version.title || "",
                blocks: Array.isArray(version.blocks) ? version.blocks : [],
                blocksJson: version.blocksJson ?? null,
                authorId: version.authorId || user.uid,
                label: version.label || "",
                createdAt: version.createdAt || now,
              },
              { merge: true }
            );
          });
        }
      }
    }

    const databases = payload.data.databases || [];
    for (const dbItem of databases) {
      if (!dbItem.id) continue;
      const ref = wsRef.collection("databases").doc(dbItem.id);
      writeOps.push((batch) => {
        batch.set(
          ref,
          {
            id: dbItem.id,
            name: dbItem.name || "Base de Dados",
            icon: dbItem.icon || "🗄️",
            description: dbItem.description || "",
            notebookId: dbItem.notebookId ?? null,
            parentPageId: dbItem.parentPageId ?? null,
            properties: Array.isArray(dbItem.properties) ? dbItem.properties : [],
            views: Array.isArray(dbItem.views) ? dbItem.views : [],
            deletedAt: dbItem.deletedAt ?? null,
            trashedWith: dbItem.trashedWith ?? null,
            createdAt: dbItem.createdAt || now,
            updatedAt: dbItem.updatedAt || now,
          },
          { merge: true }
        );
      });

      if (Array.isArray(dbItem.rows)) {
        for (const row of dbItem.rows) {
          if (!row.id) continue;
          const rRef = ref.collection("rows").doc(row.id);
          writeOps.push((batch) => {
            batch.set(
              rRef,
              {
                id: row.id,
                values: row.values || {},
                pageId: row.pageId ?? null,
                order: typeof row.order === "number" ? row.order : 0,
                createdAt: row.createdAt || now,
                updatedAt: row.updatedAt || now,
              },
              { merge: true }
            );
          });
        }
      }
    }

    const flashcards = payload.data.flashcards || [];
    for (const card of flashcards) {
      if (!card.id) continue;
      const ref = wsRef.collection("flashcards").doc(card.id);
      writeOps.push((batch) => {
        batch.set(
          ref,
          {
            id: card.id,
            workspaceId,
            notebookId: card.notebookId ?? null,
            pageId: card.pageId || "",
            pageTitle: card.pageTitle || "",
            front: card.front || "",
            back: card.back || "",
            hint: card.hint || "",
            frontImageUrl: card.frontImageUrl ?? null,
            frontImageStoragePath: card.frontImageStoragePath ?? null,
            backImageUrl: card.backImageUrl ?? null,
            backImageStoragePath: card.backImageStoragePath ?? null,
            imageUrl: card.imageUrl ?? null,
            imageStoragePath: card.imageStoragePath ?? null,
            repetition: typeof card.repetition === "number" ? card.repetition : 0,
            interval: typeof card.interval === "number" ? card.interval : 0,
            easeFactor: typeof card.easeFactor === "number" ? card.easeFactor : 2.5,
            nextReviewDate: typeof card.nextReviewDate === "number" ? card.nextReviewDate : now,
            lastReviewedAt: card.lastReviewedAt ?? null,
            createdAt: card.createdAt || now,
            updatedAt: card.updatedAt || now,
            createdBy: card.createdBy || user.uid,
          },
          { merge: true }
        );
      });
    }

    await commitBatches(db, writeOps);

    return Response.json({
      ok: true,
      stats: {
        notebooks: notebooks.length,
        pages: pages.length,
        databases: databases.length,
        flashcards: flashcards.length,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
