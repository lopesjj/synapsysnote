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
import { plainTextOf } from "./seed";
import type { CreateImportJobInput, CreatePageInput, DataAdapter, Unsubscribe } from "./adapter";

const SERVER_OWNED = ["extractedOCRText", "transcriptText", "embedding", "embeddingUpdatedAt"];

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

  async ensureWorkspace() {
    if (this.bootstrapped) return;
    try {
      await firebaseJson("/api/workspace/bootstrap", {
        method: "POST",
        body: JSON.stringify({ workspaceId: this.workspaceId }),
      });
      this.bootstrapped = true;
      return;
    } catch {
      // Admin may be missing; fall through to a client-side create that the
      // security rules allow for the first owner.
    }
    try {
      const ws = await getDoc(doc(getDb(), "workspaces", this.workspaceId));
      if (!ws.exists()) {
        await setDoc(doc(getDb(), "workspaces", this.workspaceId), {
          id: this.workspaceId,
          name: "Meu workspace",
          emoji: "🧠",
          ownerId: this.userId,
          memberIds: [this.userId],
          plan: "free",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        await setDoc(doc(getDb(), "workspaces", this.workspaceId, "members", this.userId), {
          userId: this.userId,
          role: "owner",
          joinedAt: serverTimestamp(),
        });
        await setDoc(doc(getDb(), "workspaces", this.workspaceId, "notebooks", "nb_inbox"), {
          id: "nb_inbox",
          name: "Caixa de entrada",
          emoji: "📥",
          color: "#0E7490",
          order: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      this.bootstrapped = true;
    } catch (error) {
      console.error("Falha ao provisionar workspace", error);
    }
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

  async createNotebook(input: { name: string; emoji?: string; color?: string }): Promise<Notebook> {
    const id = `nb_${nanoid(8)}`;
    const notebook: Notebook = {
      id,
      name: input.name,
      emoji: input.emoji ?? "📓",
      color: input.color ?? "#6366F1",
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

  async updateNotebook(id: string, patch: Partial<Notebook>) {
    await updateDoc(this.docRef("notebooks", id), { ...patch, updatedAt: serverTimestamp() });
  }

  async deleteNotebook(id: string) {
    await deleteDoc(this.docRef("notebooks", id));
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
      coverUrl: null,
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

  async updatePage(id: string, patch: Partial<Page>) {
    const payload: Record<string, unknown> = {
      ...patch,
      updatedBy: this.userId,
      updatedAt: serverTimestamp(),
    };
    if (patch.blocks) payload.plainText = plainTextOf(patch.blocks);
    for (const key of SERVER_OWNED) delete payload[key];
    await updateDoc(this.docRef("pages", id), payload);
  }

  async movePage(id: string, target: { notebookId?: string | null; parentPageId?: string | null }) {
    let path: string[] = [];
    if (target.parentPageId) {
      const parent = await getDoc(this.docRef("pages", target.parentPageId));
      path = parent.exists() ? [...((parent.data().path as string[]) ?? []), target.parentPageId] : [];
    }
    await updateDoc(this.docRef("pages", id), {
      ...(target.notebookId !== undefined ? { notebookId: target.notebookId } : {}),
      parentPageId: target.parentPageId ?? null,
      path,
      updatedBy: this.userId,
      updatedAt: serverTimestamp(),
    });
  }

  async trashPage(id: string) {
    await updateDoc(this.docRef("pages", id), {
      deletedAt: serverTimestamp(),
      updatedBy: this.userId,
      updatedAt: serverTimestamp(),
    });
  }

  async restorePage(id: string) {
    await updateDoc(this.docRef("pages", id), {
      deletedAt: null,
      updatedBy: this.userId,
      updatedAt: serverTimestamp(),
    });
  }

  async purgePage(id: string) {
    // Hard delete is admin-only in the rules; the callable also cleans Storage.
    await httpsCallable(getFirebaseFunctions(), "purgePage")({
      workspaceId: this.workspaceId,
      pageId: id,
    });
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
    // The browser only ever receives the authorize URL; the token exchange
    // happens server-side in /api/notion/callback (Admin SDK).
    const url = new URL("/api/notion/authorize", window.location.origin);
    url.searchParams.set("workspaceId", this.workspaceId);
    return { redirectUrl: url.toString() };
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
    await uploadBytes(storageRef, blob, { contentType: blob.type || "audio/webm" });
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
          mimeType: blob.type || "audio/webm",
          sizeBytes: blob.size,
          durationSeconds,
          pending: true,
        },
      },
    ];
    await this.updatePage(pageId, { blocks });
    // `transcribeAudio` is also wired as a Storage onFinalize trigger; the
    // explicit call keeps latency low when the user is watching.
    await httpsCallable(getFirebaseFunctions(), "transcribeAudio")({
      workspaceId: this.workspaceId,
      pageId,
      storagePath: path,
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
}
