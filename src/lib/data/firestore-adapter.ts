"use client";

import { useUiStore } from "@/lib/store/ui-store";
import { defaultWorkspaceName } from "@/lib/i18n/site-metadata";
import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Timestamp,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes, uploadBytesResumable } from "firebase/storage";
import { httpsCallable } from "firebase/functions";
import { nanoid } from "nanoid";
import type {
  AppBlock,
  AppDatabase,
  DatabaseRow,
  Flashcard,
  FlashcardRating,
  ImportJob,
  Notebook,
  NotionIntegration,
  GoogleDocsIntegration,
  EvernoteIntegration,
  CloudIntegration,
  NotionTreeNode,
  Page,
  PageVersion,
} from "@/types/models";
import { getDb, getFirebaseFunctions, getFirebaseStorage } from "@/lib/firebase/client";
import { firebaseJson } from "@/lib/firebase/auth-headers";
import { notebookSubtreeIds } from "./notebook-tree";
import { duplicateNotebookTree, duplicatePageTree } from "./duplicate";
import { subtreePatches } from "./page-tree";
import { plainTextOf } from "./seed";
import { hasMergeableMedia, mergeMediaEnrichment } from "./media-enrichment";
import { pagePatchIsNoop } from "./page-write";
import { mergeBlocks, sameBlocks } from "./block-merge";
import { prepareEditorAttachment } from "@/lib/media/compress-attachment";
import { calculateNextReview } from "@/lib/flashcards/srs";
import { cardStoragePaths } from "@/lib/flashcards/card-images";
import type {
  CopiedMedia,
  CreateFlashcardInput,
  FlashcardResetScope,
  CreateImportJobInput,
  RecordImportJobInput,
  CreatePageInput,
  DataAdapter,
  MediaCopyTarget,
  Unsubscribe,
  UpdatePageOptions,
  UpdatePageResult,
  PageWriteBase,
} from "./adapter";

const SERVER_OWNED = ["extractedOCRText", "transcriptText", "embedding", "embeddingUpdatedAt"];

const BATCH_LIMIT = 400;

async function commitWrites(ops: Array<(batch: ReturnType<typeof writeBatch>) => void>) {
  for (let start = 0; start < ops.length; start += BATCH_LIMIT) {
    const batch = writeBatch(getDb());
    for (const op of ops.slice(start, start + BATCH_LIMIT)) op(batch);
    await batch.commit();
  }
}

const MAX_PAGE_BYTES = 900_000;

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefined(item)) as T;
  }
  if (value && typeof value === "object" && (value as object).constructor === Object) {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (nested === undefined || key === "cellAlignments") continue;
      out[key] = stripUndefined(nested);
    }
    return out as T;
  }
  return value;
}


function ms(value: unknown): number {
  if (typeof value === "number") return value;
  if (value && typeof value === "object" && "toMillis" in value) {
    return (value as Timestamp).toMillis();
  }
  return 0;
}

function parseBlocksFromData(data: DocumentData | undefined): Page["blocks"] {
  if (!data) return [];
  if (typeof data.blocksJson === "string") {
    try {
      const parsed = JSON.parse(data.blocksJson);
      if (Array.isArray(parsed)) return parsed as Page["blocks"];
    } catch {}
  }
  return (data.blocks ?? []) as Page["blocks"];
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).length;
}

function assertPageFits(fields: Record<string, unknown>) {
  const sized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (key === "blocks" || value === undefined) continue;
    if (value && typeof value === "object" && !Array.isArray(value) && (value as object).constructor !== Object) continue;
    sized[key] = value;
  }
  if (utf8Bytes(JSON.stringify(sized)) > MAX_PAGE_BYTES) {
    throw new Error("NOTE_TOO_LARGE");
  }
}

function isOfflineError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  const message = error instanceof Error ? error.message : String(error);
  return code === "unavailable" || /offline/i.test(message);
}

/**
 * Escrita ainda nao confirmada pelo servidor devolve `serverTimestamp()` como
 * null por padrao: a nota recem-excluida continuava viva na tela (e, offline,
 * ate a rede voltar). A estimativa local resolve.
 */
const LOCAL_TIMESTAMPS = { serverTimestamps: "estimate" } as const;

interface PreparedPageWrite {
  payload: Record<string, unknown>;
  blocks: AppBlock[] | undefined;
  removed: string[];
  added: string[];
  conflict: boolean;
  merged: boolean;
}

function pickBase(
  editor: PageWriteBase | undefined,
  written: PageWriteBase | undefined
): PageWriteBase | undefined {
  if (!editor) return written;
  if (!written) return editor;
  return written.at > editor.at ? written : editor;
}

function mapPage(snap: QueryDocumentSnapshot<DocumentData>): Page {
  const data = snap.data(LOCAL_TIMESTAMPS);
  return {
    ...(data as Page),
    id: snap.id,
    createdAt: ms(data.createdAt),
    updatedAt: ms(data.updatedAt),
    deletedAt: data.deletedAt ? ms(data.deletedAt) : null,
    trashedWith: (data.trashedWith as string | null | undefined) ?? null,
    blocks: parseBlocksFromData(data),
    path: data.path ?? [],
    tags: data.tags ?? [],
    outgoingLinks: data.outgoingLinks ?? [],
    backlinks: data.backlinks ?? [],
    plainText: data.plainText ?? "",
    extractedOCRText: data.extractedOCRText ?? "",
    transcriptText: data.transcriptText ?? "",
  };
}

function mapNotebook(snap: QueryDocumentSnapshot<DocumentData>): Notebook {
  const data = snap.data(LOCAL_TIMESTAMPS);
  return {
    ...(data as Notebook),
    id: snap.id,
    parentId: (data.parentId as string | null | undefined) ?? null,
    deletedAt: data.deletedAt ? ms(data.deletedAt) : null,
    trashedWith: (data.trashedWith as string | null | undefined) ?? null,
    createdAt: ms(data.createdAt),
    updatedAt: ms(data.updatedAt),
  };
}

function mapFlashcard(snap: QueryDocumentSnapshot<DocumentData>): Flashcard {
  const data = snap.data(LOCAL_TIMESTAMPS);
  return {
    ...(data as Flashcard),
    id: snap.id,
    createdAt: ms(data.createdAt) || ms(data.updatedAt) || Date.now(),
    updatedAt: ms(data.updatedAt) || Date.now(),
    lastReviewedAt: data.lastReviewedAt ? ms(data.lastReviewedAt) : null,
    nextReviewDate: typeof data.nextReviewDate === "number" ? data.nextReviewDate : ms(data.nextReviewDate),
  };
}

function extractStoragePathFromValue(input: unknown): string | null {
  if (typeof input !== "string" || !input.trim()) return null;
  const val = input.trim();
  if (val.startsWith("workspaces/") || val.startsWith("users/")) return val;
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

function isStorageFile(input: unknown, workspaceId: string): boolean {
  const path = extractStoragePathFromValue(input);
  if (!path) return false;
  return path.startsWith(`workspaces/${workspaceId}/`);
}

function extractMediaPathsFromBlocks(blocks: unknown[]): string[] {
  const paths: string[] = [];
  const walk = (list: unknown[]) => {
    if (!Array.isArray(list)) return;
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const b = item as { media?: { storagePath?: string; url?: string }; children?: unknown[] };
      if (b.media?.storagePath) {
        paths.push(b.media.storagePath);
      } else if (b.media?.url) {
        paths.push(b.media.url);
      }
      if (Array.isArray(b.children) && b.children.length) {
        walk(b.children);
      }
    }
  };
  walk(blocks);
  return paths;
}

export class FirestoreAdapter implements DataAdapter {
  readonly mode = "firestore" as const;

  constructor(
    readonly workspaceId: string,
    private readonly userId: string
  ) {}

  private bootstrapped = false;
  private bootstrapPromise: Promise<void> | null = null;

  private isLocallyBootstrapped(): boolean {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(`synapsys.bootstrapped.${this.workspaceId}`) === "1";
    } catch {
      return false;
    }
  }

  private markLocallyBootstrapped() {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(`synapsys.bootstrapped.${this.workspaceId}`, "1");
    } catch {}
  }

  async ensureWorkspace() {
    if (this.bootstrapped || this.isLocallyBootstrapped()) {
      this.bootstrapped = true;
      return;
    }
    if (this.bootstrapPromise) {
      return this.bootstrapPromise;
    }
    this.bootstrapPromise = (async () => {
      try {
        await firebaseJson("/api/workspace/bootstrap", {
          method: "POST",
          body: JSON.stringify({ workspaceId: this.workspaceId, language: useUiStore.getState().language }),
        });
        await this.purgeLegacyInbox();
        this.bootstrapped = true;
        this.markLocallyBootstrapped();
        return;
      } catch {
      }
      try {
        const wsRef = doc(getDb(), "workspaces", this.workspaceId);
        const memberRef = doc(getDb(), "workspaces", this.workspaceId, "members", this.userId);
        const ws = await getDoc(wsRef);
        if (!ws.exists()) {
          await setDoc(wsRef, {
            id: this.workspaceId,
            name: defaultWorkspaceName(useUiStore.getState().language),
            emoji: "🧠",
            ownerId: this.userId,
            memberIds: [this.userId],
            plan: "free",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else {
          const memberIds = (ws.data()?.memberIds as string[] | undefined) ?? [];
          if (!memberIds.includes(this.userId) && ws.data()?.ownerId === this.userId) {
            await updateDoc(wsRef, {
              memberIds: [...memberIds, this.userId],
              updatedAt: serverTimestamp(),
            });
          }
        }

        try {
          await setDoc(
            memberRef,
            {
              userId: this.userId,
              role: "owner",
              joinedAt: serverTimestamp(),
            },
            { merge: true }
          );
        } catch {
        }

        this.bootstrapped = true;
        this.markLocallyBootstrapped();
      } catch (error) {
        console.error("Falha ao provisionar workspace", error);
      }
      await this.purgeLegacyInbox();
    })().finally(() => {
      this.bootstrapPromise = null;
    });
    return this.bootstrapPromise;
  }

  private col(name: string) {
    return collection(getDb(), "workspaces", this.workspaceId, name);
  }

  private docRef(name: string, id: string) {
    return doc(getDb(), "workspaces", this.workspaceId, name, id);
  }

  subscribeNotebooks(cb: (notebooks: Notebook[]) => void, onError?: (error: Error) => void): Unsubscribe {
    return onSnapshot(
      query(this.col("notebooks"), orderBy("order", "asc")),
      (snap) => cb(snap.docs.map(mapNotebook)),
      (error) => onError?.(error)
    );
  }

  subscribePages(cb: (pages: Page[]) => void, onError?: (error: Error) => void): Unsubscribe {
    const cache = new Map<string, Page>();
    return onSnapshot(
      query(this.col("pages"), orderBy("updatedAt", "desc")),
      (snap) => {
        for (const change of snap.docChanges()) {
          if (change.type === "removed") cache.delete(change.doc.id);
          else cache.set(change.doc.id, mapPage(change.doc));
        }
        cb(snap.docs.map((docSnap) => cache.get(docSnap.id) ?? mapPage(docSnap)));
      },
      (error) => onError?.(error)
    );
  }

  subscribeDatabases(cb: (databases: AppDatabase[]) => void): Unsubscribe {
    const rowUnsubs = new Map<string, Unsubscribe>();
    const rowsById = new Map<string, DatabaseRow[]>();
    let metas: Array<Omit<AppDatabase, "rows"> & { id: string }> = [];

    const emit = () => {
      cb(
        metas.map((meta) => ({
          ...meta,
          rows: rowsById.get(meta.id) ?? [],
        }))
      );
    };

    const unsubMeta = onSnapshot(
      this.col("databases"),
      (snap) => {
        metas = snap.docs.map((d) => {
          const data = d.data(LOCAL_TIMESTAMPS);
          return {
            ...(data as AppDatabase),
            id: d.id,
            // Sem a conversao, o Timestamp cru virava "Invalid Date" na lixeira.
            deletedAt: data.deletedAt ? ms(data.deletedAt) : null,
            trashedWith: (data.trashedWith as string | null | undefined) ?? null,
            createdAt: ms(data.createdAt),
            updatedAt: ms(data.updatedAt),
            rows: [],
          };
        });
        const live = new Set(metas.map((m) => m.id));
        for (const [id, unsub] of rowUnsubs) {
          if (!live.has(id)) {
            unsub();
            rowUnsubs.delete(id);
            rowsById.delete(id);
          }
        }
        for (const meta of metas) {
          if (rowUnsubs.has(meta.id)) continue;
          const dbId = meta.id;
          rowUnsubs.set(
            dbId,
            onSnapshot(
              query(collection(this.docRef("databases", dbId), "rows"), orderBy("order", "asc")),
              (rowsSnap) => {
                rowsById.set(
                  dbId,
                  rowsSnap.docs.map((r) => {
                    const data = r.data(LOCAL_TIMESTAMPS);
                    return {
                      ...(data as DatabaseRow),
                      id: r.id,
                      createdAt: ms(data.createdAt),
                      updatedAt: ms(data.updatedAt),
                    };
                  })
                );
                emit();
              },
              () => {}
            )
          );
        }
        emit();
      },
      () => {}
    );

    return () => {
      unsubMeta();
      for (const unsub of rowUnsubs.values()) unsub();
      rowUnsubs.clear();
    };
  }

  subscribeImportJobs(cb: (jobs: ImportJob[]) => void): Unsubscribe {
    return onSnapshot(
      query(this.col("import_jobs"), orderBy("createdAt", "desc")),
      (snap) => {
        cb(
          snap.docs.map((d) => ({
            ...(d.data() as ImportJob),
            id: d.id,
            createdAt: ms(d.data().createdAt),
            updatedAt: ms(d.data().updatedAt),
            startedAt: d.data().startedAt ? ms(d.data().startedAt) : null,
            finishedAt: d.data().finishedAt ? ms(d.data().finishedAt) : null,
            errors: d.data().errors ?? [],
            items: d.data().items ?? [],
          }))
        );
      },
      () => {}
    );
  }

  subscribeIntegration(cb: (integration: NotionIntegration | null) => void): Unsubscribe {
    return onSnapshot(
      this.docRef("integrations", "notion"),
      (snap) => {
        if (!snap.exists()) return cb(null);
        const data = snap.data();
        cb({
          ...(data as NotionIntegration),
          id: "notion",
          connectedAt: ms(data.connectedAt),
          lastSyncAt: data.lastSyncAt ? ms(data.lastSyncAt) : null,
        });
      },
      () => {}
    );
  }

  subscribeCloudIntegration(
    provider: "notion" | "google-docs" | "evernote",
    cb: (integration: CloudIntegration | null) => void
  ): Unsubscribe {
    return onSnapshot(
      this.docRef("integrations", provider),
      (snap) => {
        if (!snap.exists()) return cb(null);
        const data = snap.data();
        cb({
          ...(data as any),
          id: provider,
          connectedAt: ms(data.connectedAt),
          lastSyncAt: data.lastSyncAt ? ms(data.lastSyncAt) : null,
        } as CloudIntegration);
      },
      () => {}
    );
  }


  async createNotebook(input: {
    name: string;
    emoji?: string;
    color?: string;
    parentId?: string | null;
  }): Promise<Notebook> {
    const id = `nb_${nanoid(8)}`;
    const notebook: Notebook = {
      id,
      name: input.name,
      emoji: input.emoji ?? "📓",
      color: input.color ?? "#6366F1",
      coverUrl: null,
      parentId: input.parentId ?? null,
      order: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await setDoc(this.docRef("notebooks", id), {
      ...notebook,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return notebook;
  }

  private async docsWhereIn(collectionName: string, field: string, values: string[]) {
    const unique = [...new Set(values)];
    const groups: string[][] = [];
    for (let start = 0; start < unique.length; start += 30) groups.push(unique.slice(start, start + 30));
    const snaps = await Promise.all(
      groups.map((group) => getDocs(query(this.col(collectionName), where(field, "in", group))))
    );
    return snaps.flatMap((snap) => snap.docs);
  }

  async duplicateNotebook(id: string): Promise<Notebook> {
    const notebooksSnap = await getDocs(this.col("notebooks"));
    // Subcaderno na lixeira nao entra na copia.
    const notebooks = notebooksSnap.docs.map(mapNotebook).filter((notebook) => !notebook.deletedAt);
    const pageDocs = await this.docsWhereIn("pages", "notebookId", notebookSubtreeIds(notebooks, id));
    return duplicateNotebookTree(this, notebooks, pageDocs.map(mapPage), id);
  }

  async updateNotebook(id: string, patch: Partial<Notebook>) {
    const shouldInspectMedia = patch.coverUrl !== undefined || patch.emoji !== undefined;
    if (shouldInspectMedia) {
      const current = await getDoc(this.docRef("notebooks", id));
      if (current.exists()) {
        const data = current.data();
        const removed: string[] = [];
        if (
          patch.coverUrl !== undefined &&
          data.coverUrl &&
          data.coverUrl !== patch.coverUrl &&
          isStorageFile(data.coverUrl, this.workspaceId)
        ) {
          removed.push(data.coverUrl);
        }
        if (
          patch.emoji !== undefined &&
          data.emoji &&
          data.emoji !== patch.emoji &&
          isStorageFile(data.emoji, this.workspaceId)
        ) {
          removed.push(data.emoji);
        }
        if (removed.length > 0) {
          // Quarentena, e nao exclusao imediata: uma copia antiga do caderno
          // pode usar a mesma imagem, e a limpeza confere isso antes de apagar.
          void this.quarantineMedia(removed);
        }
      }
    }
    await updateDoc(this.docRef("notebooks", id), { ...patch, updatedAt: serverTimestamp() });
  }

  async moveNotebook(id: string, target: { parentId: string | null; order?: number }) {
    if (target.parentId === id) return;
    if (target.parentId) {
      const parent = await getDoc(this.docRef("notebooks", target.parentId));
      if (!parent.exists()) return;
      const seen = new Set<string>([id]);
      let current = (parent.data().parentId as string | null | undefined) ?? null;
      while (current && !seen.has(current)) {
        if (current === id) return;
        seen.add(current);
        const next = await getDoc(this.docRef("notebooks", current));
        current = next.exists()
          ? ((next.data().parentId as string | null | undefined) ?? null)
          : null;
      }
    }
    await updateDoc(this.docRef("notebooks", id), {
      parentId: target.parentId,
      ...(target.order !== undefined ? { order: target.order } : {}),
      updatedAt: serverTimestamp(),
    });
  }

  /**
   * Caderno vai para a lixeira como as notas: com `deletedAt` e mantendo o
   * lugar na arvore. Subcadernos, notas e bases que estavam ativos saem juntos,
   * marcados com `trashedWith`, para que restaurar o caderno traga exatamente o
   * que saiu com ele. O que ja estava na lixeira antes fica como estava.
   */
  async deleteNotebook(id: string) {
    const notebooksSnap = await getDocs(this.col("notebooks"));
    const live = notebooksSnap.docs.map(mapNotebook).filter((notebook) => !notebook.deletedAt);
    if (!live.some((notebook) => notebook.id === id)) return;
    const ids = new Set(notebookSubtreeIds(live, id));
    const [pageDocs, databaseDocs] = await Promise.all([
      this.docsWhereIn("pages", "notebookId", [...ids]),
      this.docsWhereIn("databases", "notebookId", [...ids]),
    ]);
    const ops: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];

    for (const snap of pageDocs) {
      const data = snap.data();
      const notebookId = (data.notebookId as string | null | undefined) ?? null;
      if (!notebookId || !ids.has(notebookId) || data.deletedAt) continue;
      ops.push((batch) =>
        batch.update(snap.ref, {
          deletedAt: serverTimestamp(),
          trashedWith: id,
          updatedBy: this.userId,
          updatedAt: serverTimestamp(),
        })
      );
    }
    for (const snap of databaseDocs) {
      const data = snap.data();
      const notebookId = (data.notebookId as string | null | undefined) ?? null;
      if (!notebookId || !ids.has(notebookId) || data.deletedAt) continue;
      ops.push((batch) =>
        batch.update(snap.ref, {
          deletedAt: serverTimestamp(),
          trashedWith: id,
          updatedAt: serverTimestamp(),
        })
      );
    }
    for (const notebookId of ids) {
      ops.push((batch) =>
        batch.update(this.docRef("notebooks", notebookId), {
          deletedAt: serverTimestamp(),
          trashedWith: notebookId === id ? null : id,
          updatedAt: serverTimestamp(),
        })
      );
    }
    await commitWrites(ops);
  }

  /** Reativa o caderno e os ancestrais que estiverem na lixeira (so os cadernos). */
  private notebookChainOps(
    notebookId: string | null | undefined,
    notebooks: Notebook[]
  ): Array<(batch: ReturnType<typeof writeBatch>) => void> {
    const byId = new Map(notebooks.map((notebook) => [notebook.id, notebook]));
    const ops: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];
    const seen = new Set<string>();
    let current = notebookId ? byId.get(notebookId) : undefined;
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      if (current.deletedAt) {
        const ref = this.docRef("notebooks", current.id);
        ops.push((batch) =>
          batch.update(ref, { deletedAt: null, trashedWith: null, updatedAt: serverTimestamp() })
        );
      }
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return ops;
  }

  private async allNotebooks(): Promise<Notebook[]> {
    const snap = await getDocs(this.col("notebooks"));
    return snap.docs.map(mapNotebook);
  }

  async restoreNotebook(id: string) {
    const [notebooks, withPages, withDatabases] = await Promise.all([
      this.allNotebooks(),
      getDocs(query(this.col("pages"), where("trashedWith", "==", id))),
      getDocs(query(this.col("databases"), where("trashedWith", "==", id))),
    ]);
    if (!notebooks.some((notebook) => notebook.id === id)) return;

    const ops = this.notebookChainOps(id, notebooks);
    for (const notebook of notebooks) {
      if (notebook.trashedWith !== id || !notebook.deletedAt) continue;
      const ref = this.docRef("notebooks", notebook.id);
      ops.push((batch) =>
        batch.update(ref, { deletedAt: null, trashedWith: null, updatedAt: serverTimestamp() })
      );
    }
    for (const snap of withPages.docs) {
      ops.push((batch) =>
        batch.update(snap.ref, {
          deletedAt: null,
          trashedWith: null,
          updatedBy: this.userId,
          updatedAt: serverTimestamp(),
        })
      );
    }
    for (const snap of withDatabases.docs) {
      ops.push((batch) =>
        batch.update(snap.ref, { deletedAt: null, trashedWith: null, updatedAt: serverTimestamp() })
      );
    }
    await commitWrites(ops);
  }

  async purgeNotebook(id: string) {
    try {
      await firebaseJson("/api/trash/purge", {
        method: "POST",
        body: JSON.stringify({ workspaceId: this.workspaceId, notebookId: id }),
      });
      return;
    } catch (error) {
      // Sem a API (Admin nao configurado no ambiente local), apaga so os
      // documentos; os arquivos saem na limpeza do servidor.
      const notebook = await getDoc(this.docRef("notebooks", id));
      if (!notebook.exists() || !notebook.data().deletedAt) throw error;
    }
    const [withPages, withDatabases, notebooks] = await Promise.all([
      getDocs(query(this.col("pages"), where("trashedWith", "==", id))),
      getDocs(query(this.col("databases"), where("trashedWith", "==", id))),
      this.allNotebooks(),
    ]);
    for (const snap of withPages.docs) {
      if (snap.data().deletedAt) await this.deletePageDocs(snap.ref);
    }
    for (const snap of withDatabases.docs) {
      if (snap.data().deletedAt) await this.deleteDatabaseDocs(snap.ref);
    }
    const notebookIds = [
      id,
      ...notebooks.filter((item) => item.trashedWith === id && item.deletedAt).map((item) => item.id),
    ];
    await commitWrites(
      notebookIds.map((notebookId) => (batch: ReturnType<typeof writeBatch>) =>
        batch.delete(this.docRef("notebooks", notebookId))
      )
    );
  }

  private async deletePageDocs(ref: ReturnType<typeof doc>) {
    const ops: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];
    const orphanMedia = new Set<string>();
    const [versionsSnap, cardsSnap] = await Promise.all([
      getDocs(collection(ref, "versions")),
      getDocs(query(this.col("flashcards"), where("pageId", "==", ref.id))),
    ]);
    for (const v of versionsSnap.docs) ops.push((batch) => batch.delete(v.ref));
    for (const card of cardsSnap.docs) {
      for (const path of cardStoragePaths(card.data() as Flashcard)) orphanMedia.add(path);
      ops.push((batch) => batch.delete(card.ref));
    }
    ops.push((batch) => batch.delete(ref));
    await commitWrites(ops);
    if (orphanMedia.size > 0) await this.deleteMedia([...orphanMedia]);
  }

  private async deleteDatabaseDocs(ref: ReturnType<typeof doc>) {
    const rows = await getDocs(collection(ref, "rows"));
    await commitWrites([
      ...rows.docs.map((row) => (batch: ReturnType<typeof writeBatch>) => batch.delete(row.ref)),
      (batch) => batch.delete(ref),
    ]);
  }

  private async purgeLegacyInbox() {
    const inbox = await getDoc(this.docRef("notebooks", "nb_inbox"));
    if (!inbox.exists()) return;
    const [siblings, pages] = await Promise.all([
      getDocs(this.col("notebooks")),
      getDocs(query(this.col("pages"), where("notebookId", "==", "nb_inbox"))),
    ]);
    const ops: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];
    for (const snap of siblings.docs) {
      if (snap.id === "nb_inbox") continue;
      if ((snap.data().parentId as string | null | undefined) === "nb_inbox") {
        ops.push((batch) =>
          batch.update(snap.ref, { parentId: null, updatedAt: serverTimestamp() })
        );
      }
    }
    for (const snap of pages.docs) {
      ops.push((batch) =>
        batch.update(snap.ref, { notebookId: null, updatedBy: this.userId, updatedAt: serverTimestamp() })
      );
    }
    ops.push((batch) => batch.delete(this.docRef("notebooks", "nb_inbox")));
    await commitWrites(ops);
  }


  async createPage(input: CreatePageInput): Promise<Page> {
    const id = input.id ?? `page_${nanoid(10)}`;
    let path: string[] = [];
    if (input.parentPageId) {
      const parent = await getDoc(this.docRef("pages", input.parentPageId));
      path = parent.exists() ? [...((parent.data().path as string[]) ?? []), input.parentPageId] : [];
    }
    const blocks = input.blocks ?? [{ id: `blk_${nanoid(8)}`, type: "paragraph" as const, richText: [{ text: "" }] }];
    const page: Page = {
      id,
      title: input.title ?? "Sem título",
      icon: input.icon ?? "📄",
      coverUrl: input.coverUrl ?? null,
      coverPosition: input.coverPosition ?? 0.5,
      notebookId: input.notebookId ?? null,
      parentPageId: input.parentPageId ?? null,
      path,
      blocks,
      plainText: plainTextOf(blocks),
      extractedOCRText: "",
      transcriptText: "",
      tags: input.tags ?? [],
      outgoingLinks: [],
      backlinks: [],
      embedding: null,
      embeddingUpdatedAt: null,
      favorite: false,
      archived: false,
      deletedAt: null,
      notionPageId: null,
      notionUrl: null,
      importJobId: null,
      importSource: input.importSource ?? null,
      createdBy: this.userId,
      updatedBy: this.userId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      order: Date.now(),
    };
    const writable = Object.fromEntries(
      Object.entries(page).filter(([key]) => !SERVER_OWNED.includes(key) && key !== "blocks")
    );
    const createPayload: Record<string, unknown> = {
      ...writable,
      blocksJson: JSON.stringify(blocks),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    assertPageFits(createPayload);
    await setDoc(this.docRef("pages", id), createPayload);
    return page;
  }

  async duplicatePage(id: string): Promise<Page> {
    const [page, descendants] = await Promise.all([
      getDoc(this.docRef("pages", id)),
      getDocs(query(this.col("pages"), where("path", "array-contains", id))),
    ]);
    if (!page.exists()) throw new Error("Nota não encontrada");
    const docs = [page as QueryDocumentSnapshot<DocumentData>, ...descendants.docs];
    return duplicatePageTree(this, docs.map(mapPage), id);
  }

  private lastWritten = new Map<string, { blocks: AppBlock[]; at: number }>();

  private preparePageWrite(
    pageId: string,
    patch: Partial<Page>,
    current: DocumentData | undefined,
    options: UpdatePageOptions
  ): PreparedPageWrite | null {
    const { blocks: requested, ...rest } = patch;
    let blocks = requested;
    let conflict = false;
    let merged = false;
    const currentBlocks = current ? parseBlocksFromData(current) : [];

    if (blocks && current && !options.overwrite) {
      const base = pickBase(options.base, this.lastWritten.get(pageId));
      if (base && !sameBlocks(base.blocks, currentBlocks)) {
        const result = mergeBlocks(base.blocks, blocks, currentBlocks);
        merged = !sameBlocks(result.blocks, blocks);
        conflict = result.conflict;
        blocks = result.blocks;
      }
      if (hasMergeableMedia(blocks)) blocks = mergeMediaEnrichment(blocks, currentBlocks);
    }

    const payload: Record<string, unknown> = stripUndefined({
      ...rest,
      ...(blocks ? { blocksJson: JSON.stringify(blocks), plainText: plainTextOf(blocks) } : {}),
      updatedBy: this.userId,
    });
    for (const key of SERVER_OWNED) delete payload[key];

    const comparable: Record<string, unknown> = { ...payload };
    delete comparable.blocksJson;
    if (blocks) comparable.blocks = blocks;
    if (current && pagePatchIsNoop({ ...current, blocks: currentBlocks }, comparable)) return null;

    if (blocks && current && Array.isArray(current.blocks)) payload.blocks = deleteField();
    payload.updatedAt = serverTimestamp();
    assertPageFits({ ...(current ?? {}), ...payload });

    const removed: string[] = [];
    const added: string[] = [];
    if (current) {
      if (blocks) {
        const oldPaths = new Set(extractMediaPathsFromBlocks(currentBlocks));
        const newPaths = new Set(extractMediaPathsFromBlocks(blocks));
        for (const path of oldPaths) {
          if (!newPaths.has(path) && isStorageFile(path, this.workspaceId)) removed.push(path);
        }
        for (const path of newPaths) {
          if (!oldPaths.has(path) && isStorageFile(path, this.workspaceId)) added.push(path);
        }
      }
      for (const field of ["coverUrl", "icon"] as const) {
        const before = current[field];
        const after = patch[field];
        if (after !== undefined && before && before !== after && isStorageFile(before, this.workspaceId)) {
          removed.push(before as string);
        }
        if (after && after !== before && isStorageFile(after, this.workspaceId)) added.push(after as string);
      }
    }

    return { payload, blocks, removed, added, conflict, merged };
  }

  async updatePage(id: string, patch: Partial<Page>, options: UpdatePageOptions = {}): Promise<UpdatePageResult> {
    const ref = this.docRef("pages", id);

    if (options.fast) {
      const prepared = this.preparePageWrite(id, patch, undefined, options);
      if (!prepared) return {};
      await updateDoc(ref, prepared.payload);
      if (prepared.blocks) this.lastWritten.set(id, { blocks: prepared.blocks, at: Date.now() });
      return {};
    }

    let prepared: PreparedPageWrite | null;
    try {
      prepared = await runTransaction(getDb(), async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error("PAGE_NOT_FOUND");
        const next = this.preparePageWrite(id, patch, snap.data(), options);
        if (next) tx.update(ref, next.payload);
        return next;
      });
    } catch (error) {
      if (!isOfflineError(error)) throw error;
      const snap = await getDoc(ref);
      prepared = this.preparePageWrite(id, patch, snap.exists() ? snap.data() : undefined, options);
      if (prepared) await updateDoc(ref, prepared.payload);
    }

    if (!prepared) return {};
    if (prepared.blocks) this.lastWritten.set(id, { blocks: prepared.blocks, at: Date.now() });
    if (prepared.removed.length) void this.quarantineMedia(prepared.removed, id);
    if (prepared.added.length) void this.unquarantineMedia(prepared.added);
    return prepared.merged ? { merged: true, conflict: prepared.conflict, blocks: prepared.blocks } : {};
  }

  async applyPageOrders(updates: { id: string; order: number }[]) {
    if (!updates.length) return;
    await commitWrites(
      updates.map(
        ({ id, order }) =>
          (batch) =>
            batch.update(this.docRef("pages", id), {
              order,
              updatedBy: this.userId,
              updatedAt: serverTimestamp(),
            })
      )
    );
  }

  async applyNotebookOrders(updates: { id: string; order: number }[]) {
    if (!updates.length) return;
    await commitWrites(
      updates.map(
        ({ id, order }) =>
          (batch) =>
            batch.update(this.docRef("notebooks", id), {
              order,
              updatedAt: serverTimestamp(),
            })
      )
    );
  }

  async movePage(id: string, target: { notebookId?: string | null; parentPageId?: string | null; order?: number }) {
    let path: string[] = [];
    if (target.parentPageId) {
      if (target.parentPageId === id) return;
      const parent = await getDoc(this.docRef("pages", target.parentPageId));
      const parentPath = parent.exists() ? ((parent.data().path as string[]) ?? []) : [];
      if (parentPath.includes(id)) return;
      path = parent.exists() ? [...parentPath, target.parentPageId] : [];
    }

    const moved = await getDoc(this.docRef("pages", id));
    const notebookId =
      target.notebookId !== undefined
        ? target.notebookId
        : ((moved.data()?.notebookId as string | null | undefined) ?? null);

    const ops: Array<(batch: ReturnType<typeof writeBatch>) => void> = [
      (batch) =>
        batch.update(this.docRef("pages", id), {
          notebookId,
          parentPageId: target.parentPageId ?? null,
          path,
          ...(target.order !== undefined ? { order: target.order } : {}),
          updatedBy: this.userId,
          updatedAt: serverTimestamp(),
        }),
    ];

    const descendants = await getDocs(query(this.col("pages"), where("path", "array-contains", id)));
    for (const patch of subtreePatches(descendants.docs.map(mapPage), id, path, notebookId)) {
      ops.push((batch) =>
        batch.update(this.docRef("pages", patch.pageId), {
          path: patch.path,
          notebookId: patch.notebookId,
          updatedBy: this.userId,
          updatedAt: serverTimestamp(),
        })
      );
    }

    await commitWrites(ops);
  }

  private async pageSubtreeRefs(id: string) {
    const [page, descendants, directChildren] = await Promise.all([
      getDoc(this.docRef("pages", id)),
      getDocs(query(this.col("pages"), where("path", "array-contains", id))),
      getDocs(query(this.col("pages"), where("parentPageId", "==", id))),
    ]);
    const seen = new Set<string>();
    const refs: ReturnType<typeof doc>[] = [];
    if (page.exists()) {
      refs.push(page.ref);
      seen.add(page.id);
    }
    for (const snap of descendants.docs) {
      if (!seen.has(snap.id)) {
        refs.push(snap.ref);
        seen.add(snap.id);
      }
    }
    for (const snap of directChildren.docs) {
      if (!seen.has(snap.id)) {
        refs.push(snap.ref);
        seen.add(snap.id);
      }
    }
    return refs;
  }

  async trashPage(id: string) {
    const refs = await this.pageSubtreeRefs(id);
    await commitWrites(
      refs.map((ref) => (batch) =>
        batch.update(ref, {
          deletedAt: serverTimestamp(),
          trashedWith: null,
          updatedBy: this.userId,
          updatedAt: serverTimestamp(),
        })
      )
    );
  }

  async restorePage(id: string) {
    const [pageSnap, notebooks] = await Promise.all([
      getDoc(this.docRef("pages", id)),
      this.allNotebooks(),
    ]);
    if (!pageSnap.exists()) return;
    const pageData = pageSnap.data();

    let needDetachFromParent = false;
    if (pageData.parentPageId) {
      const parentSnap = await getDoc(this.docRef("pages", pageData.parentPageId));
      if (!parentSnap.exists() || parentSnap.data().deletedAt) {
        needDetachFromParent = true;
      }
    }

    const refs = await this.pageSubtreeRefs(id);
    const ops: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];

    if (needDetachFromParent) {
      const newPath: string[] = [];
      const notebookId = (pageData.notebookId as string | null | undefined) ?? null;
      ops.push((batch) =>
        batch.update(pageSnap.ref, {
          parentPageId: null,
          path: newPath,
          deletedAt: null,
          trashedWith: null,
          updatedBy: this.userId,
          updatedAt: serverTimestamp(),
        })
      );

      const descendants = await getDocs(query(this.col("pages"), where("path", "array-contains", id)));
      for (const patch of subtreePatches(descendants.docs.map(mapPage), id, newPath, notebookId)) {
        ops.push((batch) =>
          batch.update(this.docRef("pages", patch.pageId), {
            path: patch.path,
            notebookId: patch.notebookId,
            deletedAt: null,
            trashedWith: null,
            updatedBy: this.userId,
            updatedAt: serverTimestamp(),
          })
        );
      }

      const patchedIds = new Set(descendants.docs.map((d) => d.id));
      patchedIds.add(id);
      for (const ref of refs) {
        if (!patchedIds.has(ref.id)) {
          ops.push((batch) =>
            batch.update(ref, {
              deletedAt: null,
              trashedWith: null,
              updatedBy: this.userId,
              updatedAt: serverTimestamp(),
            })
          );
        }
      }
    } else {
      for (const ref of refs) {
        ops.push((batch) =>
          batch.update(ref, {
            deletedAt: null,
            trashedWith: null,
            updatedBy: this.userId,
            updatedAt: serverTimestamp(),
          })
        );
      }
    }

    // Nota de um caderno que esta na lixeira: o caderno (e os pais dele) voltam
    // tambem, senao a nota restaurada ficaria sem lugar na barra lateral.
    ops.push(...this.notebookChainOps(pageData.notebookId as string | null | undefined, notebooks));
    await commitWrites(ops);
  }

  async purgePage(id: string) {
    try {
      await firebaseJson("/api/trash/purge", {
        method: "POST",
        body: JSON.stringify({ workspaceId: this.workspaceId, pageId: id }),
      });
    } catch {
      try {
        await httpsCallable(getFirebaseFunctions(), "purgePage")({
          workspaceId: this.workspaceId,
          pageId: id,
        });
      } catch (error) {
        // Ultimo recurso sem servidor: so documentos que estao na lixeira.
        const target = await getDoc(this.docRef("pages", id));
        if (!target.exists() || !target.data().deletedAt) throw error;
        for (const ref of await this.pageSubtreeRefs(id)) {
          const snap = ref.id === id ? target : await getDoc(ref);
          if (snap.exists() && snap.data().deletedAt) await this.deletePageDocs(ref);
        }
      }
    }
  }

  async emptyTrash() {
    try {
      await firebaseJson("/api/trash/purge", {
        method: "POST",
        body: JSON.stringify({ workspaceId: this.workspaceId, emptyAll: true }),
      });
    } catch {
      const snap = await getDocs(query(this.col("pages"), where("deletedAt", "!=", null)));
      const pages = snap.docs.map((docSnap) => ({
        id: docSnap.id,
        parentPageId: (docSnap.data().parentPageId as string | null | undefined) ?? null,
      }));
      const ids = new Set(pages.map((page) => page.id));
      const roots = pages.filter((page) => !page.parentPageId || !ids.has(page.parentPageId));
      for (const page of roots) {
        await this.purgePage(page.id);
      }

      const databases = await getDocs(query(this.col("databases"), where("deletedAt", "!=", null)));
      for (const snapDoc of databases.docs) await this.deleteDatabaseDocs(snapDoc.ref);

      const notebooks = await getDocs(query(this.col("notebooks"), where("deletedAt", "!=", null)));
      await commitWrites(
        notebooks.docs.map((snapDoc) => (batch: ReturnType<typeof writeBatch>) => batch.delete(snapDoc.ref))
      );
    }
  }

  async purgeExpiredTrash() {
    try {
      if (typeof window === "undefined") return;
      const cooldownKey = `synapsys.trash_purge_cooldown.${this.workspaceId}`;
      const last = Number(window.localStorage.getItem(cooldownKey) || 0);
      const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
      if (Date.now() - last < TWELVE_HOURS_MS) return;

      window.localStorage.setItem(cooldownKey, String(Date.now()));
      await firebaseJson("/api/trash/purge", {
        method: "POST",
        body: JSON.stringify({ workspaceId: this.workspaceId, purgeExpired: true }),
      });
    } catch {}
  }


  async listVersions(pageId: string): Promise<PageVersion[]> {
    const snap = await getDocs(
      query(collection(this.docRef("pages", pageId), "versions"), orderBy("createdAt", "desc"))
    );
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        ...(data as PageVersion),
        id: d.id,
        blocks: parseBlocksFromData(data),
        createdAt: ms(data.createdAt),
      };
    });
  }

  async snapshotVersion(pageId: string, label?: string) {
    const page = await getDoc(this.docRef("pages", pageId));
    if (!page.exists()) return;
    const data = page.data();
    const versionPayload: Record<string, unknown> = {
      pageId,
      title: data.title,
      blocksJson: data.blocksJson || JSON.stringify(parseBlocksFromData(data)),
      authorId: this.userId,
      label: label ?? null,
      createdAt: serverTimestamp(),
    };
    assertPageFits(versionPayload);
    await addDoc(collection(this.docRef("pages", pageId), "versions"), versionPayload);
  }

  async restoreVersion(pageId: string, versionId: string) {
    const version = await getDoc(doc(this.docRef("pages", pageId), "versions", versionId));
    if (!version.exists()) return;
    const data = version.data();
    await this.updatePage(pageId, {
      title: data.title,
      blocks: parseBlocksFromData(data),
    }, { overwrite: true });
  }


  async createDatabase(input: { name: string; notebookId?: string | null }): Promise<AppDatabase> {
    const id = `db_${nanoid(8)}`;
    const database: AppDatabase = {
      id,
      name: input.name,
      icon: "🗂️",
      notebookId: input.notebookId ?? null,
      parentPageId: null,
      properties: [
        { id: "p_title", name: "Nome", type: "title", order: 0, width: 320 },
        {
          id: "p_status",
          name: "Status",
          type: "select",
          order: 1,
          width: 160,
          options: [
            { id: "s_todo", name: "A fazer", color: "#6B7280" },
            { id: "s_doing", name: "Fazendo", color: "#6366F1" },
            { id: "s_done", name: "Concluído", color: "#10B981" },
          ],
        },
        { id: "p_date", name: "Data", type: "date", order: 2, width: 140 },
      ],
      views: [
        { id: "v_table", name: "Tabela", type: "table" },
        { id: "v_kanban", name: "Kanban", type: "kanban", groupByPropertyId: "p_status" },
      ],
      rows: [],
      notionDatabaseId: null,
      deletedAt: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const { rows, ...meta } = database;
    void rows;
    await setDoc(this.docRef("databases", id), {
      ...meta,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return database;
  }

  async updateDatabase(id: string, patch: Partial<AppDatabase>) {
    const { rows, ...meta } = patch;
    void rows;
    await updateDoc(this.docRef("databases", id), { ...meta, updatedAt: serverTimestamp() });
  }

  async restoreDatabase(id: string) {
    const [snap, notebooks] = await Promise.all([getDoc(this.docRef("databases", id)), this.allNotebooks()]);
    if (!snap.exists()) return;
    await commitWrites([
      (batch) =>
        batch.update(snap.ref, { deletedAt: null, trashedWith: null, updatedAt: serverTimestamp() }),
      ...this.notebookChainOps(snap.data().notebookId as string | null | undefined, notebooks),
    ]);
  }

  async purgeDatabase(id: string) {
    try {
      await firebaseJson("/api/trash/purge", {
        method: "POST",
        body: JSON.stringify({ workspaceId: this.workspaceId, databaseId: id }),
      });
    } catch (error) {
      const snap = await getDoc(this.docRef("databases", id));
      if (!snap.exists() || !snap.data().deletedAt) throw error;
      await this.deleteDatabaseDocs(snap.ref);
    }
  }

  async upsertRow(databaseId: string, row: Partial<DatabaseRow> & { id?: string }) {
    const rowRef = doc(this.docRef("databases", databaseId), "rows", row.id ?? `row_${nanoid(8)}`);

    if (row.id) {
      // Edicao de celula: so os campos informados. Regravar a linha inteira
      // mandava a linha para o fim (order), zerava a data de criacao e soltava
      // o vinculo com a pagina.
      const patch: Record<string, unknown> = { updatedAt: serverTimestamp() };
      if (row.values !== undefined) patch.values = row.values;
      if (row.order !== undefined) patch.order = row.order;
      if (row.pageId !== undefined) patch.pageId = row.pageId;
      if (row.notionPageId !== undefined) patch.notionPageId = row.notionPageId;
      try {
        await updateDoc(rowRef, patch);
        return null;
      } catch (error) {
        const code = (error as { code?: string } | null)?.code;
        if (code !== "not-found") throw error;
      }
    }

    const next: DatabaseRow = {
      id: rowRef.id,
      values: row.values ?? {},
      order: row.order ?? Date.now(),
      pageId: row.pageId ?? null,
      notionPageId: row.notionPageId ?? null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await setDoc(rowRef, { ...next, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    return next;
  }

  async deleteRow(databaseId: string, rowId: string) {
    await deleteDoc(doc(this.docRef("databases", databaseId), "rows", rowId));
  }


  async fetchNotionTree(): Promise<NotionTreeNode[]> {
    const result = await firebaseJson<{ tree: NotionTreeNode[] }>(
      `/api/notion/tree?workspaceId=${encodeURIComponent(this.workspaceId)}`
    );
    return result.tree;
  }

  async createImportJob(input: CreateImportJobInput): Promise<string> {
    const result = await firebaseJson<{ jobId: string }>("/api/notion/import", {
      method: "POST",
      body: JSON.stringify({ ...input, workspaceId: this.workspaceId }),
    });

    void this.pumpImportWorker(result.jobId);

    return result.jobId;
  }

  async recordCompletedImportJob(input: RecordImportJobInput): Promise<string> {
    const result = await firebaseJson<{ jobId: string }>("/api/import/record", {
      method: "POST",
      body: JSON.stringify({ ...input, workspaceId: this.workspaceId }),
    });
    return result.jobId;
  }

  private activeWorkers = new Set<string>();

  async resumeImportJob(jobId: string) {
    void this.pumpImportWorker(jobId);
  }

  private async pumpImportWorker(jobId: string) {
    if (this.activeWorkers.has(jobId)) return;
    this.activeWorkers.add(jobId);

    try {
      let done = false;
      let consecutiveErrors = 0;
      while (!done) {
        try {
          const stepRes = await firebaseJson<{
            done?: boolean;
            status?: string;
            processedPages?: number;
            totalPages?: number;
            busy?: boolean;
          }>("/api/notion/import", {
            method: "PUT",
            body: JSON.stringify({ workspaceId: this.workspaceId, jobId }),
          });

          consecutiveErrors = 0;
          if (stepRes?.busy) await new Promise((resolve) => setTimeout(resolve, 5000));
          if (
            stepRes?.done ||
            ["completed", "completed_with_errors", "failed", "canceled"].includes(stepRes?.status ?? "")
          ) {
            done = true;
          }
        } catch (error) {
          consecutiveErrors += 1;
          console.error("import worker step error", error);
          if (consecutiveErrors >= 5) {
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
    } finally {
      this.activeWorkers.delete(jobId);
    }
  }

  async cancelImportJob(jobId: string) {
    await updateDoc(this.docRef("import_jobs", jobId), {
      status: "canceled",
      updatedAt: serverTimestamp(),
    });
  }

  async connectNotion() {
    const result = await firebaseJson<{ redirectUrl: string }>("/api/notion/authorize", {
      method: "POST",
      body: JSON.stringify({ workspaceId: this.workspaceId }),
    });
    return { redirectUrl: result.redirectUrl };
  }

  async disconnectNotion() {
    await firebaseJson("/api/notion/disconnect", {
      method: "POST",
      body: JSON.stringify({ workspaceId: this.workspaceId }),
    });
  }

  async connectGoogleDocs(input?: {
    accessToken?: string;
    accountEmail?: string;
    accountName?: string;
    avatarUrl?: string;
  }) {
    const result = await firebaseJson<{ redirectUrl?: string; connected?: GoogleDocsIntegration }>(
      "/api/google-docs/authorize",
      {
        method: "POST",
        body: JSON.stringify({
          workspaceId: this.workspaceId,
          accessToken: input?.accessToken,
          accountEmail: input?.accountEmail,
          accountName: input?.accountName,
          avatarUrl: input?.avatarUrl,
        }),
      }
    );
    return result;
  }

  async disconnectGoogleDocs() {
    await firebaseJson("/api/google-docs/disconnect", {
      method: "POST",
      body: JSON.stringify({ workspaceId: this.workspaceId }),
    });
  }

  async connectEvernote() {
    const result = await firebaseJson<{ redirectUrl?: string; connected?: EvernoteIntegration }>(
      "/api/evernote/authorize",
      {
        method: "POST",
        body: JSON.stringify({ workspaceId: this.workspaceId }),
      }
    );
    return result;
  }

  async disconnectEvernote() {
    await firebaseJson("/api/evernote/disconnect", {
      method: "POST",
      body: JSON.stringify({ workspaceId: this.workspaceId }),
    });
  }


  async uploadAudioNote(pageId: string, blob: Blob, _durationSeconds: number): Promise<{ url: string; storagePath: string }> {
    const rawMime = (blob.type || "audio/webm").split(";")[0] || "audio/webm";
    const nameExt = (blob as File).name ? (blob as File).name.split(".").pop()?.toLowerCase() : null;
    const ext = nameExt && /^(mp3|wav|ogg|oga|m4a|aac|flac|opus|webm|weba|mp4)$/.test(nameExt)
      ? nameExt
      : rawMime.includes("mpeg") || rawMime.includes("mp3")
        ? "mp3"
        : rawMime.includes("mp4") || rawMime.includes("m4a")
          ? "mp4"
          : rawMime.includes("aac")
            ? "aac"
            : rawMime.includes("wav")
              ? "wav"
              : rawMime.includes("ogg")
                ? "ogg"
                : rawMime.includes("flac")
                  ? "flac"
                  : rawMime.includes("opus")
                    ? "opus"
                    : "webm";
    const mimeType = ext === "mp3" && rawMime === "audio/webm" ? "audio/mpeg" : rawMime;
    const fileId = `${Date.now()}-${nanoid(6)}.${ext}`;
    const path = `workspaces/${this.workspaceId}/audio/${pageId}/${fileId}`;
    const storageRef = ref(getFirebaseStorage(), path);
    await uploadBytes(storageRef, blob, { contentType: mimeType });
    const url = await getDownloadURL(storageRef);
    return { url, storagePath: path };
  }

  async saveAudioNote(pageId: string, blob: Blob, durationSeconds: number) {
    const rawMime = (blob.type || "audio/webm").split(";")[0] || "audio/webm";
    const nameExt = (blob as File).name ? (blob as File).name.split(".").pop()?.toLowerCase() : null;
    const ext = nameExt && /^(mp3|wav|ogg|oga|m4a|aac|flac|opus|webm|weba|mp4)$/.test(nameExt)
      ? nameExt
      : rawMime.includes("mpeg") || rawMime.includes("mp3")
        ? "mp3"
        : rawMime.includes("mp4") || rawMime.includes("m4a")
          ? "mp4"
          : rawMime.includes("aac")
            ? "aac"
            : rawMime.includes("wav")
              ? "wav"
              : rawMime.includes("ogg")
                ? "ogg"
                : rawMime.includes("flac")
                  ? "flac"
                  : rawMime.includes("opus")
                    ? "opus"
                    : "webm";
    const mimeType = ext === "mp3" && rawMime === "audio/webm" ? "audio/mpeg" : rawMime;
    const fileId = `${Date.now()}-${nanoid(6)}.${ext}`;
    const path = `workspaces/${this.workspaceId}/audio/${pageId}/${fileId}`;
    const storageRef = ref(getFirebaseStorage(), path);
    await uploadBytes(storageRef, blob, { contentType: mimeType });
    const url = await getDownloadURL(storageRef);

    const page = await getDoc(this.docRef("pages", pageId));
    const blocks = [
      ...parseBlocksFromData(page.data()),
      {
        id: `blk_${nanoid(8)}`,
        type: "audio" as const,
        media: {
          url,
          storagePath: path,
          name: fileId,
          mimeType,
          sizeBytes: blob.size,
          durationSeconds,
          pending: false,
        },
      },
    ];
    await this.updatePage(pageId, { blocks });
  }

  async uploadAttachment(
    pageId: string,
    file: File,
    onProgress?: (percent: number) => void
  ): Promise<{ url: string; storagePath: string }> {
    file = await prepareEditorAttachment(file);
    const fileId = `${Date.now()}-${nanoid(6)}-${file.name}`;
    const path = `workspaces/${this.workspaceId}/uploads/${pageId}/${fileId}`;
    const storageRef = ref(getFirebaseStorage(), path);
    if (onProgress) {
      // Vídeo chega a 150 MB: o envio resumível sobrevive a oscilação de rede e
      // ainda diz quanto já subiu.
      await new Promise<void>((resolve, reject) => {
        const task = uploadBytesResumable(storageRef, file, { contentType: file.type });
        task.on(
          "state_changed",
          (snapshot) => {
            if (snapshot.totalBytes > 0) {
              onProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100));
            }
          },
          reject,
          () => resolve()
        );
      });
    } else {
      await uploadBytes(storageRef, file, { contentType: file.type });
    }
    const url = await getDownloadURL(storageRef);


    return { url, storagePath: path };
  }

  async saveAttachment(pageId: string, file: File) {
    const isImage = file.type.startsWith("image/");
    const { url, storagePath } = await this.uploadAttachment(pageId, file);

    const page = await getDoc(this.docRef("pages", pageId));
    const blocks = [
      ...parseBlocksFromData(page.data()),
      {
        id: `blk_${nanoid(8)}`,
        type: (isImage ? "image" : "file") as "image" | "file",
        media: {
          url,
          storagePath,
          name: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          pending: false,
        },
      },
    ];
    await this.updatePage(pageId, { blocks });
  }

  async uploadWorkspaceIcon(file: File) {
    let uploadData: Blob | File = file;
    let contentType = file.type || "image/png";
    let ext = file.name.split(".").pop() || "png";

    if (typeof window !== "undefined" && typeof FileReader !== "undefined") {
      try {
        const blob = await new Promise<Blob | null>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => {
            const img = new Image();
            img.onload = () => {
              const canvas = document.createElement("canvas");
              const max = 512;
              let w = img.width;
              let h = img.height;
              if (w > max || h > max) {
                if (w > h) {
                  h = Math.round((h * max) / w);
                  w = max;
                } else {
                  w = Math.round((w * max) / h);
                  h = max;
                }
              }
              canvas.width = Math.max(1, w);
              canvas.height = Math.max(1, h);
              const ctx = canvas.getContext("2d");
              if (ctx) {
                ctx.drawImage(img, 0, 0, w, h);
                canvas.toBlob((b) => resolve(b), "image/webp", 0.9);
                return;
              }
              resolve(null);
            };
            img.onerror = () => resolve(null);
            img.src = String(reader.result);
          };
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(file);
        });
        if (blob) {
          uploadData = blob;
          contentType = "image/webp";
          ext = "webp";
        }
      } catch {}
    }

    const baseName = file.name.replace(/\.[^/.]+$/, "").replace(/[^\w.\-]+/g, "_").slice(-60) || "icon";
    const safeName = `${baseName}.${ext}`;
    const path = `workspaces/${this.workspaceId}/uploads/icons/${Date.now()}-${nanoid(6)}-${safeName}`;
    const storageRef = ref(getFirebaseStorage(), path);
    await uploadBytes(storageRef, uploadData, { contentType });
    return getDownloadURL(storageRef);
  }

  async deleteMedia(storagePaths: string[]): Promise<void> {
    if (!storagePaths || storagePaths.length === 0) return;
    try {
      await firebaseJson("/api/media/delete", {
        method: "POST",
        body: JSON.stringify({ workspaceId: this.workspaceId, storagePaths }),
      });
    } catch (err) {
      console.error("Falha ao excluir mídia do storage:", err);
    }
  }

  async copyMedia(target: MediaCopyTarget, sources: string[]): Promise<Record<string, CopiedMedia>> {
    const unique = [...new Set(sources.filter((source) => isStorageFile(source, this.workspaceId)))];
    const copies: Record<string, CopiedMedia> = {};
    for (let start = 0; start < unique.length; start += 100) {
      try {
        const result = await firebaseJson<{ copies?: Record<string, CopiedMedia> }>("/api/media/copy", {
          method: "POST",
          body: JSON.stringify({
            workspaceId: this.workspaceId,
            target: target === "icons" ? "icons" : "page",
            pageId: target === "icons" ? undefined : target.pageId,
            sources: unique.slice(start, start + 100),
          }),
        });
        Object.assign(copies, result.copies ?? {});
      } catch (err) {
        // Sem a copia a nota duplicada continua funcionando, so compartilhando o
        // arquivo; a limpeza da lixeira nao apaga arquivo que ainda tem dono.
        console.error("Falha ao copiar mídia:", err);
      }
    }
    return copies;
  }

  async quarantineMedia(storagePaths: string[], pageId?: string): Promise<void> {
    if (!storagePaths || storagePaths.length === 0) return;
    try {
      await firebaseJson("/api/media/quarantine", {
        method: "POST",
        body: JSON.stringify({
          workspaceId: this.workspaceId,
          pageId,
          storagePaths,
          action: "quarantine",
        }),
      });
    } catch (err) {
      console.error("Falha ao colocar mídia em quarentena:", err);
    }
  }

  async unquarantineMedia(storagePaths: string[]): Promise<void> {
    if (!storagePaths || storagePaths.length === 0) return;
    try {
      await firebaseJson("/api/media/quarantine", {
        method: "POST",
        body: JSON.stringify({
          workspaceId: this.workspaceId,
          storagePaths,
          action: "unquarantine",
        }),
      });
    } catch (err) {
      console.error("Falha ao desmarcar mídia da quarentena:", err);
    }
  }

  subscribeFlashcards(cb: (cards: Flashcard[]) => void, onError?: (error: Error) => void): Unsubscribe {
    const q = query(this.col("flashcards"), orderBy("createdAt", "desc"));
    return onSnapshot(
      q,
      (snap) => {
        cb(snap.docs.map(mapFlashcard).sort((a, b) => b.createdAt - a.createdAt));
      },
      (err) => {
        console.error("Falha ao escutar flashcards:", err);
        onError?.(err);
      }
    );
  }

  async listPageFlashcards(pageId: string): Promise<Flashcard[]> {
    const snap = await getDocs(query(this.col("flashcards"), where("pageId", "==", pageId)));
    return snap.docs.map(mapFlashcard);
  }

  async createFlashcard(input: CreateFlashcardInput): Promise<Flashcard> {
    const now = Date.now();
    const docRef = doc(this.col("flashcards"));
    const card: Flashcard = {
      id: docRef.id,
      workspaceId: this.workspaceId,
      pageId: input.pageId,
      notebookId: input.notebookId ?? null,
      pageTitle: input.pageTitle,
      front: input.front,
      back: input.back,
      hint: input.hint,
      frontImageUrl: input.frontImageUrl ?? null,
      frontImageStoragePath: input.frontImageStoragePath ?? null,
      backImageUrl: input.backImageUrl ?? null,
      backImageStoragePath: input.backImageStoragePath ?? null,
      repetition: 0,
      interval: 1,
      easeFactor: 2.5,
      nextReviewDate: now,
      lastReviewedAt: null,
      createdAt: now,
      updatedAt: now,
      createdBy: this.userId,
    };
    await setDoc(docRef, {
      ...card,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return card;
  }

  async updateFlashcard(id: string, patch: Partial<Flashcard>): Promise<void> {
    const cleanPatch: Record<string, unknown> = { ...patch };
    delete cleanPatch.id;
    delete cleanPatch.createdAt;
    delete cleanPatch.workspaceId;
    // `ignoreUndefinedProperties` descarta chaves undefined, entao limpar um
    // campo opcional (ex.: a dica) exige deleteField() explicito.
    for (const [key, value] of Object.entries(cleanPatch)) {
      if (value === undefined) cleanPatch[key] = deleteField();
    }
    await updateDoc(this.docRef("flashcards", id), {
      ...cleanPatch,
      updatedAt: serverTimestamp(),
    });
  }

  async deleteFlashcard(id: string): Promise<void> {
    const targetRef = this.docRef("flashcards", id);
    const snap = await getDoc(targetRef);
    if (snap.exists()) {
      // Frente, verso e o campo legado: qualquer um esquecido vira orfao no storage.
      const paths = cardStoragePaths(snap.data() as Flashcard);
      if (paths.length > 0) await this.deleteMedia(paths);
    }
    await deleteDoc(targetRef);
  }

  async deleteFlashcardsByPage(pageId: string): Promise<number> {
    const snap = await getDocs(query(this.col("flashcards"), where("pageId", "==", pageId)));
    if (snap.empty) return 0;

    // Junta as imagens de todos os cards numa unica limpeza, em vez de uma
    // chamada por card.
    const paths = new Set<string>();
    for (const docSnap of snap.docs) {
      for (const path of cardStoragePaths(docSnap.data() as Flashcard)) paths.add(path);
    }

    await commitWrites(
      snap.docs.map((docSnap) => (batch: ReturnType<typeof writeBatch>) =>
        batch.delete(docSnap.ref)
      )
    );
    if (paths.size > 0) await this.deleteMedia([...paths]);

    return snap.size;
  }

  async reviewFlashcard(id: string, rating: FlashcardRating, modifier = 1.0): Promise<void> {
    const targetRef = this.docRef("flashcards", id);
    const reviewPatch = (card: Flashcard) => {
      const result = calculateNextReview(card, rating, modifier);
      return {
        repetition: result.repetition,
        interval: result.interval,
        easeFactor: result.easeFactor,
        nextReviewDate: result.nextReviewDate,
        lastReviewedAt: Date.now(),
        updatedAt: serverTimestamp(),
      };
    };
    try {
      await runTransaction(getDb(), async (tx) => {
        const snap = await tx.get(targetRef);
        if (snap.exists()) tx.update(targetRef, reviewPatch(snap.data() as Flashcard));
      });
    } catch (error) {
      if (!isOfflineError(error)) throw error;
      const snap = await getDoc(targetRef);
      if (snap.exists()) await updateDoc(targetRef, reviewPatch(snap.data() as Flashcard));
    }
  }

  async resetFlashcardsProgress(scope?: FlashcardResetScope): Promise<number> {
    const now = Date.now();
    const resetPayload = {
      repetition: 0,
      interval: 1,
      easeFactor: 2.5,
      nextReviewDate: now,
      lastReviewedAt: null,
    };

    if (scope?.cardIds) {
      const ids = Array.from(new Set(scope.cardIds.filter(Boolean)));
      if (ids.length === 0) return 0;
      await commitWrites(
        ids.map((id) => (batch: ReturnType<typeof writeBatch>) =>
          batch.update(this.docRef("flashcards", id), {
            ...resetPayload,
            updatedAt: serverTimestamp(),
          })
        )
      );
      return ids.length;
    }

    const base = this.col("flashcards");
    let target = query(base);
    if (scope?.pageId) {
      target = query(base, where("pageId", "==", scope.pageId));
    } else if (scope && "notebookId" in scope) {
      target = query(base, where("notebookId", "==", scope.notebookId ?? null));
    }

    const snap = await getDocs(target);
    if (snap.empty) return 0;

    await commitWrites(
      snap.docs.map((docSnap) => (batch: ReturnType<typeof writeBatch>) =>
        batch.update(docSnap.ref, { ...resetPayload, updatedAt: serverTimestamp() })
      )
    );

    return snap.size;
  }

  async uploadFlashcardImage(pageId: string, cardId: string, file: File): Promise<{ url: string; storagePath?: string }> {
    // Mesmo preparo das imagens do editor: lado maior limitado a 2048px,
    // reencode em JPEG e compressao ate caber no limite de 1 MB.
    const prepared = await prepareEditorAttachment(file);
    const ext = (prepared.name.split(".").pop() || "jpg").toLowerCase();
    const storagePath = `workspaces/${this.workspaceId}/uploads/${pageId}/fc_${cardId}_${Date.now()}.${ext}`;
    const storage = getFirebaseStorage();
    const fileRef = ref(storage, storagePath);
    const snap = await uploadBytes(fileRef, prepared, {
      contentType: prepared.type || "image/jpeg",
    });
    const url = await getDownloadURL(snap.ref);
    return { url, storagePath };
  }
}
