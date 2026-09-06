"use client";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Timestamp,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { httpsCallable } from "firebase/functions";
import { nanoid } from "nanoid";
import type {
  AppDatabase,
  DatabaseRow,
  ImportJob,
  Notebook,
  NotionIntegration,
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
import {
  clearMediaPending,
  hasMergeableMedia,
  mergeMediaEnrichment,
  stampTranscript,
  type TranscriptResult,
} from "./media-enrichment";
import { canonicalizePagePatch, pagePatchIsNoop } from "./page-write";
import type {
  CreateImportJobInput,
  CreatePageInput,
  DataAdapter,
  Unsubscribe,
} from "./adapter";

const SERVER_OWNED = ["extractedOCRText", "transcriptText", "embedding", "embeddingUpdatedAt"];

/** Firestore caps a batch at 500 writes; leave headroom for the notebook docs. */
const BATCH_LIMIT = 400;

async function commitWrites(ops: Array<(batch: ReturnType<typeof writeBatch>) => void>) {
  for (let start = 0; start < ops.length; start += BATCH_LIMIT) {
    const batch = writeBatch(getDb());
    for (const op of ops.slice(start, start + BATCH_LIMIT)) op(batch);
    await batch.commit();
  }
}

/** Stay under the 1 MiB document cap with room for metadata and indexes. */
const MAX_PAGE_JSON_BYTES = 900_000;

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefined(item)) as T;
  }
  if (value && typeof value === "object" && (value as object).constructor === Object) {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (nested === undefined) continue;
      out[key] = stripUndefined(nested);
    }
    return out as T;
  }
  return value;
}

/**
 * ETAPA 2 — Production adapter.
 *
 * Every read is an `onSnapshot` listener so the UI is real-time by default and
 * keeps rendering from the offline cache when the connection drops. Secrets
 * (Notion tokens, Vision, Gemini) stay on the server: Notion import runs through
 * Next.js routes backed by Firebase Admin.
 */

/** Firestore Timestamps and plain numbers both flow through the same model. */
function ms(value: unknown): number {
  if (typeof value === "number") return value;
  if (value && typeof value === "object" && "toMillis" in value) {
    return (value as Timestamp).toMillis();
  }
  return 0;
}

function mapPage(snap: QueryDocumentSnapshot<DocumentData>): Page {
  const data = snap.data();
  return {
    ...(data as Page),
    id: snap.id,
    createdAt: ms(data.createdAt),
    updatedAt: ms(data.updatedAt),
    deletedAt: data.deletedAt ? ms(data.deletedAt) : null,
    blocks: data.blocks ?? [],
    path: data.path ?? [],
    tags: data.tags ?? [],
    outgoingLinks: data.outgoingLinks ?? [],
    backlinks: data.backlinks ?? [],
    plainText: data.plainText ?? "",
    extractedOCRText: data.extractedOCRText ?? "",
    transcriptText: data.transcriptText ?? "",
  };
}

export class FirestoreAdapter implements DataAdapter {
  readonly mode = "firestore" as const;

  constructor(
    readonly workspaceId: string,
    private readonly userId: string
  ) {}

  private bootstrapped = false;
  private lastPagePatch = new Map<string, Record<string, unknown>>();

  private rememberPagePatch(id: string, patch: Record<string, unknown>) {
    this.lastPagePatch.set(id, {
      ...(this.lastPagePatch.get(id) ?? {}),
      ...canonicalizePagePatch(patch),
    });
  }

  async ensureWorkspace() {
    if (this.bootstrapped) return;
    try {
      await firebaseJson("/api/workspace/bootstrap", {
        method: "POST",
        body: JSON.stringify({ workspaceId: this.workspaceId }),
      });
      await this.purgeLegacyInbox();
      this.bootstrapped = true;
      return;
    } catch {
      // Admin may be missing; fall through to a client-side create that the
      // security rules allow for the first owner.
    }
    try {
      const wsRef = doc(getDb(), "workspaces", this.workspaceId);
      const memberRef = doc(getDb(), "workspaces", this.workspaceId, "members", this.userId);
      const ws = await getDoc(wsRef);
      if (!ws.exists()) {
        await setDoc(wsRef, {
          id: this.workspaceId,
          name: "Meu workspace",
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

      // Creating the member doc is allowed for the personal-workspace owner even
      // when we cannot read it yet (isMember requires the doc to already exist).
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
        // Already a member, or the client is not allowed to rewrite membership.
      }

      this.bootstrapped = true;
    } catch (error) {
      console.error("Falha ao provisionar workspace", error);
    }
    await this.purgeLegacyInbox();
  }

  private col(name: string) {
    return collection(getDb(), "workspaces", this.workspaceId, name);
  }

  private docRef(name: string, id: string) {
    return doc(getDb(), "workspaces", this.workspaceId, name, id);
  }

  /* ------------------------------------------------------------ read paths */

  subscribeNotebooks(cb: (notebooks: Notebook[]) => void): Unsubscribe {
    return onSnapshot(query(this.col("notebooks"), orderBy("order", "asc")), (snap) => {
      cb(
        snap.docs.map((d) => ({
          ...(d.data() as Notebook),
          id: d.id,
          parentId: (d.data().parentId as string | null | undefined) ?? null,
          createdAt: ms(d.data().createdAt),
          updatedAt: ms(d.data().updatedAt),
        }))
      );
    });
  }

  subscribePages(cb: (pages: Page[]) => void): Unsubscribe {
    return onSnapshot(
      query(this.col("pages"), orderBy("updatedAt", "desc")),
      { includeMetadataChanges: true },
      (snap) => cb(snap.docs.map(mapPage))
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
        metas = snap.docs.map((d) => ({
          ...(d.data() as AppDatabase),
          id: d.id,
          createdAt: ms(d.data().createdAt),
          updatedAt: ms(d.data().updatedAt),
          rows: [],
        }));
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
            onSnapshot(query(collection(this.docRef("databases", dbId), "rows"), orderBy("order", "asc")), (rowsSnap) => {
              rowsById.set(
                dbId,
                rowsSnap.docs.map((r) => ({
                  ...(r.data() as DatabaseRow),
                  id: r.id,
                  createdAt: ms(r.data().createdAt),
                  updatedAt: ms(r.data().updatedAt),
                }))
              );
              emit();
            })
          );
        }
        emit();
      },
      (error) => console.error("subscribeDatabases", error)
    );

    return () => {
      unsubMeta();
      for (const unsub of rowUnsubs.values()) unsub();
      rowUnsubs.clear();
    };
  }

  subscribeImportJobs(cb: (jobs: ImportJob[]) => void): Unsubscribe {
    return onSnapshot(query(this.col("import_jobs"), orderBy("createdAt", "desc")), (snap) => {
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
    });
  }

  subscribeIntegration(cb: (integration: NotionIntegration | null) => void): Unsubscribe {
    return onSnapshot(this.docRef("integrations", "notion"), (snap) => {
      if (!snap.exists()) return cb(null);
      const data = snap.data();
      cb({
        ...(data as NotionIntegration),
        id: "notion",
        connectedAt: ms(data.connectedAt),
        lastSyncAt: data.lastSyncAt ? ms(data.lastSyncAt) : null,
      });
    });
  }

  /* ------------------------------------------------------------ notebooks */

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

  async duplicateNotebook(id: string): Promise<Notebook> {
    const [notebooksSnap, pagesSnap] = await Promise.all([
      getDocs(this.col("notebooks")),
      getDocs(this.col("pages")),
    ]);
    const notebooks = notebooksSnap.docs.map((snap) => ({
      ...(snap.data() as Notebook),
      id: snap.id,
      parentId: (snap.data().parentId as string | null | undefined) ?? null,
    }));
    return duplicateNotebookTree(this, notebooks, pagesSnap.docs.map(mapPage), id);
  }

  async updateNotebook(id: string, patch: Partial<Notebook>) {
    await updateDoc(this.docRef("notebooks", id), { ...patch, updatedAt: serverTimestamp() });
  }

  async moveNotebook(id: string, target: { parentId: string | null }) {
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
      updatedAt: serverTimestamp(),
    });
  }

  async deleteNotebook(id: string) {
    const [notebooksSnap, pagesSnap, databasesSnap] = await Promise.all([
      getDocs(this.col("notebooks")),
      getDocs(this.col("pages")),
      getDocs(this.col("databases")),
    ]);
    const notebooks = notebooksSnap.docs.map((snap) => ({
      id: snap.id,
      parentId: (snap.data().parentId as string | null | undefined) ?? null,
    }));
    const ids = new Set(notebookSubtreeIds(notebooks, id));
    const ops: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];

    for (const snap of pagesSnap.docs) {
      const notebookId = (snap.data().notebookId as string | null | undefined) ?? null;
      if (!notebookId || !ids.has(notebookId)) continue;
      ops.push((batch) =>
        batch.update(snap.ref, {
          notebookId: null,
          deletedAt: snap.data().deletedAt ?? serverTimestamp(),
          updatedBy: this.userId,
          updatedAt: serverTimestamp(),
        })
      );
    }
    for (const snap of databasesSnap.docs) {
      const notebookId = (snap.data().notebookId as string | null | undefined) ?? null;
      if (!notebookId || !ids.has(notebookId)) continue;
      ops.push((batch) =>
        batch.update(snap.ref, {
          notebookId: null,
          deletedAt: snap.data().deletedAt ?? serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      );
    }
    for (const notebookId of ids) {
      ops.push((batch) => batch.delete(this.docRef("notebooks", notebookId)));
    }
    await commitWrites(ops);
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
        batch.update(snap.ref, { notebookId: null, updatedAt: serverTimestamp() })
      );
    }
    ops.push((batch) => batch.delete(this.docRef("notebooks", "nb_inbox")));
    await commitWrites(ops);
  }

  /* ---------------------------------------------------------------- pages */

  async createPage(input: CreatePageInput): Promise<Page> {
    const id = `page_${nanoid(10)}`;
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
      createdBy: this.userId,
      updatedBy: this.userId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      order: Date.now(),
    };
    // `extractedOCRText`, `transcriptText` and `embedding` are server-owned;
    // the rules reject them on create, so they are stripped here.
    const writable = Object.fromEntries(
      Object.entries(page).filter(([key]) => !SERVER_OWNED.includes(key))
    );
    await setDoc(this.docRef("pages", id), {
      ...writable,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return page;
  }

  async duplicatePage(id: string): Promise<Page> {
    const pagesSnap = await getDocs(this.col("pages"));
    return duplicatePageTree(this, pagesSnap.docs.map(mapPage), id);
  }

  async updatePage(id: string, patch: Partial<Page>) {
    let blocks = patch.blocks;
    let currentData: DocumentData | undefined;
    if (blocks && hasMergeableMedia(blocks)) {
      const current = await getDoc(this.docRef("pages", id));
      if (current.exists()) {
        currentData = current.data();
        blocks = mergeMediaEnrichment(blocks, (currentData?.blocks ?? []) as Page["blocks"]);
      }
    }
    const payload: Record<string, unknown> = stripUndefined({
      ...patch,
      ...(blocks ? { blocks } : {}),
      updatedBy: this.userId,
      updatedAt: serverTimestamp(),
    });
    if (blocks) payload.plainText = plainTextOf(blocks);
    for (const key of SERVER_OWNED) delete payload[key];

    const comparable = { ...payload };
    delete comparable.updatedAt;
    delete comparable.updatedBy;
    const baseline = currentData ?? this.lastPagePatch.get(id);
    if (baseline && pagePatchIsNoop(baseline, comparable)) {
      this.rememberPagePatch(id, comparable);
      return;
    }

    const encoded = JSON.stringify(payload);
    if (encoded.length > MAX_PAGE_JSON_BYTES) {
      throw new Error(
        "Esta nota ficou grande demais para salvar. Divida o conteúdo em subpáginas ou anexe arquivos em vez de colar mídia."
      );
    }

    await updateDoc(this.docRef("pages", id), payload);
    this.rememberPagePatch(id, comparable);
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
    for (const { id, order } of updates) this.rememberPagePatch(id, { order });
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

  async movePage(id: string, target: { notebookId?: string | null; parentPageId?: string | null }) {
    let path: string[] = [];
    if (target.parentPageId) {
      const parent = await getDoc(this.docRef("pages", target.parentPageId));
      path = parent.exists() ? [...((parent.data().path as string[]) ?? []), target.parentPageId] : [];
    }

    const moved = await getDoc(this.docRef("pages", id));
    const notebookId =
      target.notebookId !== undefined
        ? target.notebookId
        : ((moved.data()?.notebookId as string | null | undefined) ?? null);

    const batch = writeBatch(getDb());
    batch.update(this.docRef("pages", id), {
      notebookId,
      parentPageId: target.parentPageId ?? null,
      path,
      updatedBy: this.userId,
      updatedAt: serverTimestamp(),
    });

    // Descendants carry a materialised path and a denormalised notebookId, so
    // the whole subtree has to follow the move or it detaches from its parent.
    // `array-contains` on `path` is a single-field query — no composite index.
    const descendants = await getDocs(query(this.col("pages"), where("path", "array-contains", id)));
    for (const patch of subtreePatches(descendants.docs.map(mapPage), id, path, notebookId)) {
      batch.update(this.docRef("pages", patch.pageId), {
        path: patch.path,
        notebookId: patch.notebookId,
        updatedBy: this.userId,
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
  }

  private async pageSubtreeRefs(id: string) {
    const [page, descendants] = await Promise.all([
      getDoc(this.docRef("pages", id)),
      getDocs(query(this.col("pages"), where("path", "array-contains", id))),
    ]);
    const refs = descendants.docs.map((snap) => snap.ref);
    if (page.exists()) refs.unshift(page.ref);
    return refs;
  }

  async trashPage(id: string) {
    const refs = await this.pageSubtreeRefs(id);
    await commitWrites(
      refs.map((ref) => (batch) =>
        batch.update(ref, {
          deletedAt: serverTimestamp(),
          updatedBy: this.userId,
          updatedAt: serverTimestamp(),
        })
      )
    );
  }

  async restorePage(id: string) {
    const refs = await this.pageSubtreeRefs(id);
    await commitWrites(
      refs.map((ref) => (batch) =>
        batch.update(ref, {
          deletedAt: null,
          updatedBy: this.userId,
          updatedAt: serverTimestamp(),
        })
      )
    );
  }

  async purgePage(id: string) {
    try {
      await httpsCallable(getFirebaseFunctions(), "purgePage")({
        workspaceId: this.workspaceId,
        pageId: id,
      });
    } catch {
      const refs = await this.pageSubtreeRefs(id);
      await commitWrites(refs.map((ref) => (batch) => batch.delete(ref)));
    }
  }

  async emptyTrash() {
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
    for (const snapDoc of databases.docs) {
      const rows = await getDocs(collection(snapDoc.ref, "rows"));
      await commitWrites([
        ...rows.docs.map((row) => (batch: ReturnType<typeof writeBatch>) => batch.delete(row.ref)),
        (batch) => batch.delete(snapDoc.ref),
      ]);
    }
  }

  /* ------------------------------------------------------------- versions */

  async listVersions(pageId: string): Promise<PageVersion[]> {
    const snap = await getDocs(
      query(collection(this.docRef("pages", pageId), "versions"), orderBy("createdAt", "desc"))
    );
    return snap.docs.map((d) => ({
      ...(d.data() as PageVersion),
      id: d.id,
      createdAt: ms(d.data().createdAt),
    }));
  }

  async snapshotVersion(pageId: string, label?: string) {
    const page = await getDoc(this.docRef("pages", pageId));
    if (!page.exists()) return;
    await addDoc(collection(this.docRef("pages", pageId), "versions"), {
      pageId,
      title: page.data().title,
      blocks: page.data().blocks ?? [],
      authorId: this.userId,
      label: label ?? null,
      createdAt: serverTimestamp(),
    });
  }

  async restoreVersion(pageId: string, versionId: string) {
    const version = await getDoc(doc(this.docRef("pages", pageId), "versions", versionId));
    if (!version.exists()) return;
    await this.updatePage(pageId, {
      title: version.data().title,
      blocks: version.data().blocks ?? [],
    });
  }

  /* ------------------------------------------------------------ databases */

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

  async upsertRow(databaseId: string, row: Partial<DatabaseRow> & { id?: string }) {
    const rowId = row.id ?? `row_${nanoid(8)}`;
    const rowRef = doc(this.docRef("databases", databaseId), "rows", rowId);
    const next: DatabaseRow = {
      id: rowId,
      values: row.values ?? {},
      order: row.order ?? Date.now(),
      pageId: row.pageId ?? null,
      notionPageId: row.notionPageId ?? null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await setDoc(
      rowRef,
      { ...next, createdAt: serverTimestamp(), updatedAt: serverTimestamp() },
      { merge: true }
    );
    return next;
  }

  async deleteRow(databaseId: string, rowId: string) {
    await deleteDoc(doc(this.docRef("databases", databaseId), "rows", rowId));
  }

  /* --------------------------------------------------------------- Notion */

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
    // Backup worker in case Next.js `after()` is not scheduled by the host.
    void firebaseJson("/api/notion/import", {
      method: "PUT",
      body: JSON.stringify({ workspaceId: this.workspaceId, jobId: result.jobId }),
    }).catch((error) => console.error("import worker", error));
    return result.jobId;
  }

  async cancelImportJob(jobId: string) {
    await updateDoc(this.docRef("import_jobs", jobId), {
      status: "canceled",
      updatedAt: serverTimestamp(),
    });
  }

  async connectNotion() {
    // Session-bound start: the server stamps this user's uid into OAuth state
    // so the callback stores the Notion token on their workspace only.
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

  /* ---------------------------------------------------------------- media */

  async saveAudioNote(pageId: string, blob: Blob, durationSeconds: number) {
    const fileId = `${Date.now()}-${nanoid(6)}.webm`;
    const path = `workspaces/${this.workspaceId}/audio/${pageId}/${fileId}`;
    const storageRef = ref(getFirebaseStorage(), path);
    const mimeType = (blob.type || "audio/webm").split(";")[0] || "audio/webm";
    await uploadBytes(storageRef, blob, { contentType: mimeType });
    const url = await getDownloadURL(storageRef);

    const page = await getDoc(this.docRef("pages", pageId));
    const blocks = [
      ...((page.data()?.blocks ?? []) as Page["blocks"]),
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
          pending: true,
        },
      },
    ];
    await this.updatePage(pageId, { blocks });
    await this.requestTranscription(pageId, path);
  }

  async retryMediaProcessing(pageId: string, storagePath: string) {
    await this.requestTranscription(pageId, storagePath);
  }

  private async requestTranscription(pageId: string, storagePath: string) {
    try {
      const result = await this.invokeTranscription(pageId, storagePath);
      if (result) await this.applyTranscriptResult(pageId, storagePath, result);
    } catch (error) {
      await this.clearPendingMedia(pageId, storagePath);
      throw error;
    }
  }

  private async invokeTranscription(
    pageId: string,
    storagePath: string
  ): Promise<TranscriptResult | null> {
    const payload = { workspaceId: this.workspaceId, pageId, storagePath };
    try {
      const callable = httpsCallable<typeof payload, TranscriptResult>(
        getFirebaseFunctions(),
        "transcribeAudio"
      );
      const { data } = await Promise.race([
        callable(payload),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("A transcrição demorou demais.")), 45_000)
        ),
      ]);
      return data;
    } catch {
      return firebaseJson<TranscriptResult>("/api/ai/transcribe", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    }
  }

  private async applyTranscriptResult(
    pageId: string,
    storagePath: string,
    result: TranscriptResult
  ) {
    const page = await getDoc(this.docRef("pages", pageId));
    if (!page.exists()) return;
    const blocks = stampTranscript((page.data()?.blocks ?? []) as Page["blocks"], storagePath, result);
    await this.updatePage(pageId, { blocks });
  }

  private async clearPendingMedia(pageId: string, storagePath: string) {
    const page = await getDoc(this.docRef("pages", pageId));
    if (!page.exists()) return;
    await this.updatePage(pageId, {
      blocks: clearMediaPending((page.data()?.blocks ?? []) as Page["blocks"], storagePath),
    });
  }

  async saveAttachment(pageId: string, file: File) {
    const fileId = `${Date.now()}-${nanoid(6)}-${file.name}`;
    const path = `workspaces/${this.workspaceId}/uploads/${pageId}/${fileId}`;
    const storageRef = ref(getFirebaseStorage(), path);
    await uploadBytes(storageRef, file, { contentType: file.type });
    const url = await getDownloadURL(storageRef);
    const isImage = file.type.startsWith("image/");

    const page = await getDoc(this.docRef("pages", pageId));
    const blocks = [
      ...((page.data()?.blocks ?? []) as Page["blocks"]),
      {
        id: `blk_${nanoid(8)}`,
        type: (isImage ? "image" : "file") as "image" | "file",
        media: {
          url,
          storagePath: path,
          name: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          pending: isImage || file.type === "application/pdf",
        },
      },
    ];
    await this.updatePage(pageId, { blocks });

    await addDoc(this.col("attachments"), {
      pageId,
      storagePath: path,
      url,
      name: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      uploadedBy: this.userId,
      createdAt: serverTimestamp(),
    });
    // OCR runs from the Storage trigger; nothing else to do here.
  }

  async uploadWorkspaceIcon(file: File) {
    const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
    const path = `workspaces/${this.workspaceId}/uploads/icons/${Date.now()}-${nanoid(6)}-${safeName}`;
    const storageRef = ref(getFirebaseStorage(), path);
    await uploadBytes(storageRef, file, { contentType: file.type || "image/png" });
    return getDownloadURL(storageRef);
  }
}
