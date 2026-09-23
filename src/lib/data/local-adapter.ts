"use client";

import { nanoid } from "nanoid";
import type {
  AppDatabase,
  DatabaseRow,
  Flashcard,
  FlashcardRating,
  ImportJob,
  ImportJobItem,
  Notebook,
  NotionIntegration,
  GoogleDocsIntegration,
  EvernoteIntegration,
  CloudIntegration,
  NotionTreeNode,
  Page,
  PageVersion,
} from "@/types/models";
import {
  NOTION_MOCK_TREE,
  findNode,
  mockConvertedBlocks,
  mockFileCount,
  parentMap,
} from "@/lib/notion/mock-workspace";
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
} from "./adapter";
import { pageSubtree, subtreePatches } from "./page-tree";
import { notebookSubtreeIds } from "./notebook-tree";
import { duplicateNotebookTree, duplicatePageTree } from "./duplicate";
import { buildSeed, plainTextOf } from "./seed";
import { extractAggregatedTranscripts, mergeMediaEnrichment } from "./media-enrichment";
import { pagePatchIsNoop } from "./page-write";
import { prepareEditorAttachment } from "@/lib/media/compress-attachment";
import { calculateNextReview } from "@/lib/flashcards/srs";
import {
  resolveImportPlacement,
  resolveNotebookParentId,
  shouldImportAsNotebook,
  type ImportRole,
} from "@/lib/notion/classify-import";


const STORAGE_KEY = "synapsys.workspace.v1";

interface LocalState {
  notebooks: Notebook[];
  pages: Page[];
  databases: AppDatabase[];
  jobs: ImportJob[];
  versions: PageVersion[];
  integration: NotionIntegration | null;
  googleDocsIntegration?: GoogleDocsIntegration | null;
  evernoteIntegration?: EvernoteIntegration | null;
  flashcards?: Flashcard[];
}

type Listener = () => void;

const LEGACY_INBOX_ID = "nb_inbox";

function stripLegacyInbox(state: LocalState): LocalState {
  if (!state.notebooks.some((notebook) => notebook.id === LEGACY_INBOX_ID)) return state;
  return {
    ...state,
    notebooks: state.notebooks
      .filter((notebook) => notebook.id !== LEGACY_INBOX_ID)
      .map((notebook) =>
        notebook.parentId === LEGACY_INBOX_ID ? { ...notebook, parentId: null } : notebook
      ),
    pages: state.pages.map((page) =>
      page.notebookId === LEGACY_INBOX_ID ? { ...page, notebookId: null } : page
    ),
  };
}

function nowMs() {
  return Date.now();
}

const INLINE_LIMIT_BYTES = 1_500_000;

async function toPersistableUrl(blob: Blob): Promise<string> {
  if (typeof URL === "undefined") return "";
  if (blob.size > INLINE_LIMIT_BYTES || typeof FileReader === "undefined") {
    return URL.createObjectURL(blob);
  }
  return new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => resolve(URL.createObjectURL(blob));
    reader.readAsDataURL(blob);
  });
}

export class LocalAdapter implements DataAdapter {
  readonly mode = "local" as const;
  readonly workspaceId = "demo-workspace";

  private state: LocalState;
  private listeners = new Set<Listener>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor() {
    this.state = this.load();
  }


  private load(): LocalState {
    if (typeof window !== "undefined") {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as LocalState;
          if (parsed.pages?.length) {
            return stripLegacyInbox({
              ...parsed,
              versions: parsed.versions ?? [],
              jobs: parsed.jobs ?? [],
              integration: parsed.integration ?? null,
              flashcards: parsed.flashcards ?? [],
            });
          }
        } catch {}
      }
    }
    const seed = buildSeed();
    return { ...seed, jobs: [], versions: [], integration: null, flashcards: [] };
  }

  private persist() {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {}
  }

  private emit() {
    this.persist();
    for (const listener of this.listeners) listener();
  }

  private subscribe(listener: Listener): Unsubscribe {
    this.listeners.add(listener);
    listener();
    return () => this.listeners.delete(listener);
  }

  reset() {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    const seed = buildSeed();
    this.state = { ...seed, jobs: [], versions: [], integration: null, flashcards: [] };
    this.emit();
  }

  async ensureWorkspace() {}


  subscribeNotebooks(cb: (notebooks: Notebook[]) => void) {
    return this.subscribe(() => cb([...this.state.notebooks].sort((a, b) => a.order - b.order)));
  }

  subscribePages(cb: (pages: Page[]) => void) {
    return this.subscribe(() => cb([...this.state.pages]));
  }

  subscribeDatabases(cb: (databases: AppDatabase[]) => void) {
    return this.subscribe(() => cb([...this.state.databases]));
  }

  subscribeImportJobs(cb: (jobs: ImportJob[]) => void) {
    return this.subscribe(() =>
      cb([...this.state.jobs].sort((a, b) => b.createdAt - a.createdAt))
    );
  }

  subscribeIntegration(cb: (integration: NotionIntegration | null) => void) {
    return this.subscribe(() => cb(this.state.integration));
  }

  subscribeCloudIntegration(
    provider: "notion" | "google-docs" | "evernote",
    cb: (integration: CloudIntegration | null) => void
  ) {
    return this.subscribe(() => {
      if (provider === "notion") cb(this.state.integration);
      else if (provider === "google-docs") cb(this.state.googleDocsIntegration ?? null);
      else if (provider === "evernote") cb(this.state.evernoteIntegration ?? null);
      else cb(null);
    });
  }


  async createNotebook(input: {
    name: string;
    emoji?: string;
    color?: string;
    parentId?: string | null;
  }): Promise<Notebook> {
    const notebook: Notebook = {
      id: `nb_${nanoid(8)}`,
      name: input.name,
      emoji: input.emoji ?? "📓",
      color: input.color ?? "#6366F1",
      coverUrl: null,
      parentId: input.parentId ?? null,
      order: this.state.notebooks.length,
      createdAt: nowMs(),
      updatedAt: nowMs(),
    };
    this.state.notebooks.push(notebook);
    this.emit();
    return notebook;
  }

  async duplicateNotebook(id: string): Promise<Notebook> {
    const notebook = await duplicateNotebookTree(this, this.state.notebooks, this.state.pages, id);
    this.emit();
    return notebook;
  }

  async updateNotebook(id: string, patch: Partial<Notebook>) {
    this.state.notebooks = this.state.notebooks.map((n) =>
      n.id === id ? { ...n, ...patch, updatedAt: nowMs() } : n
    );
    this.emit();
  }

  async moveNotebook(id: string, target: { parentId: string | null; order?: number }) {
    if (target.parentId === id) return;
    if (target.parentId) {
      const seen = new Set<string>([id]);
      let current = this.state.notebooks.find((notebook) => notebook.id === target.parentId);
      while (current) {
        if (seen.has(current.id)) return;
        if (current.id === id) return;
        seen.add(current.id);
        const parentId = current.parentId ?? null;
        current = parentId
          ? this.state.notebooks.find((notebook) => notebook.id === parentId)
          : undefined;
      }
    }
    this.state.notebooks = this.state.notebooks.map((notebook) =>
      notebook.id === id
        ? {
            ...notebook,
            parentId: target.parentId,
            order: target.order !== undefined ? target.order : notebook.order,
            updatedAt: nowMs(),
          }
        : notebook
    );
    this.emit();
  }

  async deleteNotebook(id: string) {
    const live = this.state.notebooks.filter((notebook) => !notebook.deletedAt);
    if (!live.some((notebook) => notebook.id === id)) return;
    const ids = new Set(notebookSubtreeIds(live, id));
    const now = nowMs();
    this.state.notebooks = this.state.notebooks.map((notebook) =>
      ids.has(notebook.id)
        ? { ...notebook, deletedAt: now, trashedWith: notebook.id === id ? null : id, updatedAt: now }
        : notebook
    );
    this.state.pages = this.state.pages.map((page) =>
      page.notebookId && ids.has(page.notebookId) && !page.deletedAt
        ? { ...page, deletedAt: now, trashedWith: id }
        : page
    );
    this.state.databases = this.state.databases.map((database) =>
      database.notebookId && ids.has(database.notebookId) && !database.deletedAt
        ? { ...database, deletedAt: now, trashedWith: id }
        : database
    );
    this.emit();
  }

  /** Reativa o caderno e os ancestrais que estiverem na lixeira (so os cadernos). */
  private restoreNotebookChain(notebookId: string | null | undefined) {
    const byId = new Map(this.state.notebooks.map((notebook) => [notebook.id, notebook]));
    const chain = new Set<string>();
    let current = notebookId ? byId.get(notebookId) : undefined;
    while (current && !chain.has(current.id)) {
      if (current.deletedAt) chain.add(current.id);
      else chain.add(`live:${current.id}`);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    this.state.notebooks = this.state.notebooks.map((notebook) =>
      chain.has(notebook.id) ? { ...notebook, deletedAt: null, trashedWith: null } : notebook
    );
  }

  async restoreNotebook(id: string) {
    if (!this.state.notebooks.some((notebook) => notebook.id === id)) return;
    this.restoreNotebookChain(id);
    this.state.notebooks = this.state.notebooks.map((notebook) =>
      notebook.trashedWith === id ? { ...notebook, deletedAt: null, trashedWith: null } : notebook
    );
    this.state.pages = this.state.pages.map((page) =>
      page.trashedWith === id ? { ...page, deletedAt: null, trashedWith: null } : page
    );
    this.state.databases = this.state.databases.map((database) =>
      database.trashedWith === id ? { ...database, deletedAt: null, trashedWith: null } : database
    );
    this.emit();
  }

  async purgeNotebook(id: string) {
    const notebook = this.state.notebooks.find((item) => item.id === id);
    if (!notebook?.deletedAt) return;
    const pageIds = new Set(
      this.state.pages.filter((page) => page.trashedWith === id && page.deletedAt).map((page) => page.id)
    );
    this.state.pages = this.state.pages.filter((page) => !pageIds.has(page.id));
    this.state.versions = this.state.versions.filter((v) => !pageIds.has(v.pageId));
    this.state.flashcards = (this.state.flashcards ?? []).filter((c) => !pageIds.has(c.pageId));
    this.state.databases = this.state.databases.filter(
      (database) => !(database.trashedWith === id && database.deletedAt)
    );
    this.state.notebooks = this.state.notebooks.filter(
      (item) => item.id !== id && !(item.trashedWith === id && item.deletedAt)
    );
    this.emit();
  }


  async createPage(input: CreatePageInput): Promise<Page> {
    const parent = input.parentPageId
      ? this.state.pages.find((p) => p.id === input.parentPageId)
      : null;
    const blocks = input.blocks ?? [
      { id: `blk_${nanoid(8)}`, type: "paragraph" as const, richText: [{ text: "" }] },
    ];
    const page: Page = {
      id: input.id ?? `page_${nanoid(10)}`,
      title: input.title ?? "Sem título",
      icon: input.icon ?? "📄",
      coverUrl: input.coverUrl ?? null,
      coverPosition: input.coverPosition ?? 0.5,
      notebookId: input.notebookId ?? parent?.notebookId ?? null,
      parentPageId: input.parentPageId ?? null,
      path: parent ? [...parent.path, parent.id] : [],
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
      createdBy: "demo-user",
      updatedBy: "demo-user",
      createdAt: nowMs(),
      updatedAt: nowMs(),
      order: this.state.pages.length,
    };
    this.state.pages.push(page);
    this.emit();
    return page;
  }

  async duplicatePage(id: string): Promise<Page> {
    const page = await duplicatePageTree(this, this.state.pages, id);
    this.reindexBacklinks();
    this.emit();
    return page;
  }

  async updatePage(id: string, patch: Partial<Page>, _options?: UpdatePageOptions) {
    void _options;
    const current = this.state.pages.find((page) => page.id === id);
    if (!current) return;
    const blocks = patch.blocks ? mergeMediaEnrichment(patch.blocks, current.blocks) : current.blocks;
    const next = {
      ...current,
      ...patch,
      ...(patch.blocks ? { blocks } : {}),
    };
    if (patch.blocks) next.plainText = plainTextOf(blocks);
    if (pagePatchIsNoop(current, next)) return;
    this.state.pages = this.state.pages.map((page) =>
      page.id === id ? { ...next, updatedAt: nowMs(), updatedBy: "demo-user" } : page
    );
    this.reindexBacklinks();
    this.emit();
  }

  async applyPageOrders(updates: { id: string; order: number }[]) {
    for (const { id, order } of updates) await this.updatePage(id, { order });
  }

  async applyNotebookOrders(updates: { id: string; order: number }[]) {
    for (const { id, order } of updates) await this.updateNotebook(id, { order });
  }

  private reindexBacklinks() {
    const incoming = new Map<string, Set<string>>();
    for (const page of this.state.pages) {
      for (const target of page.outgoingLinks) {
        if (!incoming.has(target)) incoming.set(target, new Set());
        incoming.get(target)!.add(page.id);
      }
    }
    this.state.pages = this.state.pages.map((page) => ({
      ...page,
      backlinks: [...(incoming.get(page.id) ?? [])],
    }));
  }

  async movePage(id: string, target: { notebookId?: string | null; parentPageId?: string | null; order?: number }) {
    const page = this.state.pages.find((p) => p.id === id);
    if (!page) return;

    const parent = target.parentPageId
      ? this.state.pages.find((p) => p.id === target.parentPageId)
      : null;
    const path = parent ? [...parent.path, parent.id] : [];
    const notebookId = target.notebookId !== undefined ? target.notebookId : page.notebookId;

    for (const patch of subtreePatches(this.state.pages, id, path, notebookId)) {
      await this.updatePage(patch.pageId, { path: patch.path, notebookId: patch.notebookId });
    }

    await this.updatePage(id, {
      notebookId,
      parentPageId: target.parentPageId ?? null,
      path,
      ...(target.order !== undefined ? { order: target.order } : {}),
    });
  }

  async trashPage(id: string) {
    const ids = new Set(pageSubtree(this.state.pages, id).map((page) => page.id));
    const now = nowMs();
    this.state.pages = this.state.pages.map((page) =>
      ids.has(page.id) ? { ...page, deletedAt: page.deletedAt ?? now, trashedWith: null } : page
    );
    this.emit();
  }

  async restorePage(id: string) {
    const page = this.state.pages.find((p) => p.id === id);
    if (!page) return;

    let needDetach = false;
    if (page.parentPageId) {
      const parent = this.state.pages.find((p) => p.id === page.parentPageId);
      if (!parent || parent.deletedAt) {
        needDetach = true;
      }
    }

    const ids = new Set(pageSubtree(this.state.pages, id).map((p) => p.id));
    if (needDetach) {
      const patches = new Map(
        subtreePatches(this.state.pages, id, [], page.notebookId).map((patch) => [patch.pageId, patch])
      );
      this.state.pages = this.state.pages.map((p) => {
        if (p.id === id) {
          return { ...p, parentPageId: null, path: [], deletedAt: null, trashedWith: null };
        }
        const patch = patches.get(p.id);
        if (patch) {
          return { ...p, path: patch.path, notebookId: patch.notebookId, deletedAt: null, trashedWith: null };
        }
        if (ids.has(p.id)) {
          return { ...p, deletedAt: null, trashedWith: null };
        }
        return p;
      });
    } else {
      this.state.pages = this.state.pages.map((p) =>
        ids.has(p.id) ? { ...p, deletedAt: null, trashedWith: null } : p
      );
    }
    this.restoreNotebookChain(page.notebookId);
    this.emit();
  }

  async purgePage(id: string) {
    // So sai o que esta na lixeira: subnota ja restaurada continua viva.
    const target = this.state.pages.find((page) => page.id === id);
    if (!target?.deletedAt) return;
    const ids = new Set(
      pageSubtree(this.state.pages, id)
        .filter((page) => page.deletedAt)
        .map((page) => page.id)
    );
    this.state.pages = this.state.pages.filter((page) => !ids.has(page.id));
    this.state.versions = this.state.versions.filter((v) => !ids.has(v.pageId));
    this.state.flashcards = (this.state.flashcards ?? []).filter((c) => !ids.has(c.pageId));
    this.emit();
  }

  async emptyTrash() {
    const trashedPageIds = new Set(this.state.pages.filter((page) => page.deletedAt).map((p) => p.id));
    this.state.pages = this.state.pages.filter((page) => !page.deletedAt);
    this.state.versions = this.state.versions.filter((v) => !trashedPageIds.has(v.pageId));
    this.state.databases = this.state.databases.filter((database) => !database.deletedAt);
    this.state.notebooks = this.state.notebooks.filter((notebook) => !notebook.deletedAt);
    this.state.flashcards = (this.state.flashcards ?? []).filter((c) => !trashedPageIds.has(c.pageId));
    this.emit();
  }

  async purgeExpiredTrash() {
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    const threshold = nowMs() - THIRTY_DAYS_MS;
    const expired = (value: number | null | undefined) => Boolean(value && value <= threshold);
    const expiredPageIds = new Set(this.state.pages.filter((page) => expired(page.deletedAt)).map((p) => p.id));
    const hasExpired =
      expiredPageIds.size > 0 ||
      this.state.databases.some((database) => expired(database.deletedAt)) ||
      this.state.notebooks.some((notebook) => expired(notebook.deletedAt));
    if (!hasExpired) return;
    this.state.pages = this.state.pages.filter((page) => !expiredPageIds.has(page.id));
    this.state.versions = this.state.versions.filter((v) => !expiredPageIds.has(v.pageId));
    this.state.flashcards = (this.state.flashcards ?? []).filter((c) => !expiredPageIds.has(c.pageId));
    this.state.databases = this.state.databases.filter((database) => !expired(database.deletedAt));
    this.state.notebooks = this.state.notebooks.filter((notebook) => !expired(notebook.deletedAt));
    this.emit();
  }


  async listVersions(pageId: string): Promise<PageVersion[]> {
    return this.state.versions
      .filter((v) => v.pageId === pageId)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async snapshotVersion(pageId: string, label?: string) {
    const page = this.state.pages.find((p) => p.id === pageId);
    if (!page) return;
    this.state.versions.push({
      id: `ver_${nanoid(8)}`,
      pageId,
      title: page.title,
      blocks: page.blocks,
      authorId: "demo-user",
      label,
      createdAt: nowMs(),
    });
    this.state.versions = this.state.versions.slice(-120);
    this.emit();
  }

  async restoreVersion(pageId: string, versionId: string) {
    const version = this.state.versions.find((v) => v.id === versionId);
    if (!version) return;
    await this.updatePage(pageId, { title: version.title, blocks: version.blocks });
  }


  async createDatabase(input: { name: string; notebookId?: string | null }): Promise<AppDatabase> {
    const database: AppDatabase = {
      id: `db_${nanoid(8)}`,
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
      createdAt: nowMs(),
      updatedAt: nowMs(),
    };
    this.state.databases.push(database);
    this.emit();
    return database;
  }

  async updateDatabase(id: string, patch: Partial<AppDatabase>) {
    this.state.databases = this.state.databases.map((d) =>
      d.id === id ? { ...d, ...patch, updatedAt: nowMs() } : d
    );
    this.emit();
  }

  async restoreDatabase(id: string) {
    const database = this.state.databases.find((d) => d.id === id);
    if (!database) return;
    this.restoreNotebookChain(database.notebookId);
    this.state.databases = this.state.databases.map((d) =>
      d.id === id ? { ...d, deletedAt: null, trashedWith: null, updatedAt: nowMs() } : d
    );
    this.emit();
  }

  async purgeDatabase(id: string) {
    this.state.databases = this.state.databases.filter((d) => !(d.id === id && d.deletedAt));
    this.emit();
  }

  async upsertRow(databaseId: string, row: Partial<DatabaseRow> & { id?: string }) {
    const database = this.state.databases.find((d) => d.id === databaseId);
    if (!database) throw new Error(`Base de dados ${databaseId} não encontrada`);
    const existing = row.id ? database.rows.find((r) => r.id === row.id) : undefined;
    const next: DatabaseRow = existing
      ? { ...existing, ...row, values: { ...existing.values, ...(row.values ?? {}) }, updatedAt: nowMs() }
      : {
          id: row.id ?? `row_${nanoid(8)}`,
          values: row.values ?? {},
          order: row.order ?? database.rows.length,
          pageId: row.pageId ?? null,
          notionPageId: row.notionPageId ?? null,
          createdAt: nowMs(),
          updatedAt: nowMs(),
        };
    database.rows = existing
      ? database.rows.map((r) => (r.id === next.id ? next : r))
      : [...database.rows, next];
    database.updatedAt = nowMs();
    this.emit();
    return next;
  }

  async deleteRow(databaseId: string, rowId: string) {
    const database = this.state.databases.find((d) => d.id === databaseId);
    if (!database) return;
    database.rows = database.rows.filter((r) => r.id !== rowId);
    this.emit();
  }


  async fetchNotionTree(): Promise<NotionTreeNode[]> {
    return NOTION_MOCK_TREE;
  }

  async connectNotion() {
    const integration: NotionIntegration = {
      id: "notion",
      provider: "notion",
      connected: true,
      workspaceName: "Acme HQ (demonstração)",
      workspaceIcon: "🏢",
      notionWorkspaceId: "demo-notion-workspace",
      tokenPreview: "secret_••••4f2a",
      scopes: ["read_content", "read_user"],
      connectedBy: "demo-user",
      connectedAt: nowMs(),
      lastSyncAt: null,
    };
    this.state.integration = integration;
    this.emit();
    return { connected: integration };
  }

  async disconnectNotion() {
    this.state.integration = null;
    this.emit();
  }

  async connectGoogleDocs(_input?: {
    accessToken?: string;
    accountEmail?: string;
    accountName?: string;
    avatarUrl?: string;
  }): Promise<{ redirectUrl?: string } | { connected: GoogleDocsIntegration }> {
    throw new Error("guest_account_required");
  }

  async disconnectGoogleDocs() {
    this.state.googleDocsIntegration = null;
    this.emit();
  }

  async connectEvernote(): Promise<{ redirectUrl?: string } | { connected: EvernoteIntegration }> {
    throw new Error("guest_account_required");
  }

  async disconnectEvernote() {
    this.state.evernoteIntegration = null;
    this.emit();
  }

  async createImportJob(input: CreateImportJobInput): Promise<string> {
    const jobId = `job_${nanoid(8)}`;
    const items: ImportJobItem[] = input.items.map((item) => ({
      notionId: item.notionId,
      title: item.title,
      type: item.type,
      status: "queued",
      fileCount: mockFileCount({ id: item.notionId, title: item.title, type: item.type }),
    }));
    const job: ImportJob = {
      id: jobId,
      provider: "notion",
      status: "pending",
      currentStep: "Job enfileirado",
      totalPages: items.length,
      processedPages: 0,
      totalFiles: items.reduce((sum, item) => sum + (item.fileCount ?? 0), 0),
      processedFiles: 0,
      totalBytes: 0,
      errors: [],
      items,
      selection: input.selection,
      targetNotebookId: input.targetNotebookId,
      options: input.options,
      requestedBy: "demo-user",
      startedAt: null,
      finishedAt: null,
      createdAt: nowMs(),
      updatedAt: nowMs(),
    };
    this.state.jobs.unshift(job);
    this.emit();
    this.runSimulatedWorker(jobId);
    return jobId;
  }

  async recordCompletedImportJob(input: RecordImportJobInput): Promise<string> {
    const id = `job_${nanoid(8)}`;
    const items: ImportJobItem[] =
      input.items && input.items.length
        ? input.items
        : [
            {
              notionId: "import_item",
              title: input.title || "Importação",
              type: "page",
              status: "done",
            },
          ];
    const newJob: ImportJob = {
      id,
      provider: input.provider,
      status: input.status,
      currentStep: "Concluído",
      totalPages: input.totalPages,
      processedPages: input.processedPages,
      totalFiles: input.totalFiles,
      processedFiles: input.processedFiles,
      totalBytes: 0,
      errors: [],
      items,
      selection: { notionIds: [], importAll: false },
      targetNotebookId: null,
      options: { downloadMedia: true, preserveHierarchy: true, createBacklinks: false },
      requestedBy: "demo-user",
      startedAt: nowMs(),
      finishedAt: nowMs(),
      createdAt: nowMs(),
      updatedAt: nowMs(),
    };
    this.state.jobs.unshift(newJob);
    this.emit();
    return id;
  }

  async cancelImportJob(jobId: string) {
    this.patchJob(jobId, { status: "canceled", currentStep: "Cancelado pelo usuário", finishedAt: nowMs() });
    const timer = this.timers.get(jobId);
    if (timer) clearTimeout(timer);
    this.timers.delete(jobId);
  }

  private patchJob(jobId: string, patch: Partial<ImportJob>) {
    this.state.jobs = this.state.jobs.map((job) =>
      job.id === jobId ? { ...job, ...patch, updatedAt: nowMs() } : job
    );
    this.emit();
  }

  private runSimulatedWorker(jobId: string) {
    const job = this.state.jobs.find((j) => j.id === jobId);
    if (!job) return;

    const parents = new Map<string, string | null>(Object.entries(parentMap(NOTION_MOCK_TREE)));
    const notionToAppId = new Map<string, string>();
    const roles = new Map<string, ImportRole>();
    for (const item of job.items) {
      const treeNode = findNode(NOTION_MOCK_TREE, item.notionId);
      const childCount = treeNode?.children?.length ?? 0;
      if (item.type === "database" || treeNode?.type === "database") {
        if (job.options.preserveHierarchy && childCount > 0) {
          roles.set(item.notionId, "notebook");
        } else {
          roles.set(item.notionId, "database");
        }
        continue;
      }
      const asNotebook =
        job.options.preserveHierarchy &&
        shouldImportAsNotebook({
          childCount,
          blocks: [],
        });
      roles.set(item.notionId, asNotebook ? "notebook" : "page");
    }
    let index = 0;

    this.patchJob(jobId, {
      status: "discovering",
      currentStep: "Lendo estrutura do workspace no Notion…",
      startedAt: nowMs(),
    });

    const step = () => {
      const current = this.state.jobs.find((j) => j.id === jobId);
      if (!current || current.status === "canceled") return;

      if (index >= current.items.length) {
        this.patchJob(jobId, {
          status: current.errors.length ? "completed_with_errors" : "completed",
          currentStep: current.errors.length
            ? `Concluído com ${current.errors.length} aviso(s)`
            : "Importação concluída",
          finishedAt: nowMs(),
        });
        if (this.state.integration) {
          this.state.integration = { ...this.state.integration, lastSyncAt: nowMs() };
        }
        this.emit();
        this.timers.delete(jobId);
        return;
      }

      const item = current.items[index];
      const node = findNode(NOTION_MOCK_TREE, item.notionId) ?? {
        id: item.notionId,
        title: item.title,
        type: item.type,
      };

      const blocks = mockConvertedBlocks(node);
      const placement = resolveImportPlacement({
        notionId: item.notionId,
        parents,
        roles,
        idMap: notionToAppId,
        fallbackNotebookId: current.targetNotebookId,
        preserveHierarchy: current.options.preserveHierarchy,
      });

      if (roles.get(item.notionId) === "notebook") {
        this.state.pages = this.state.pages.filter((p) => p.notionPageId !== node.id);
        this.state.databases = this.state.databases.filter((d) => d.notionDatabaseId !== node.id);
        const existingNb = this.state.notebooks.find((nb) => nb.notionPageId === node.id);
        const notebook: Notebook = {
          id: existingNb?.id ?? `nb_${nanoid(8)}`,
          name: node.title,
          emoji: node.icon ?? "📓",
          color: "#0E7490",
          parentId: resolveNotebookParentId({
            notionId: node.id,
            parents,
            roles,
            idMap: notionToAppId,
          }),
          order: existingNb?.order ?? Date.now(),
          createdAt: existingNb?.createdAt ?? nowMs(),
          updatedAt: nowMs(),
        };
        if (existingNb) {
          Object.assign(existingNb, notebook);
        } else {
          this.state.notebooks.push(notebook);
        }
        notionToAppId.set(node.id, notebook.id);
      } else if (node.type === "database") {
        this.state.pages = this.state.pages.filter((p) => p.notionPageId !== node.id);
        this.state.notebooks = this.state.notebooks.filter((nb) => nb.notionPageId !== node.id);
        const existingDb = this.state.databases.find((d) => d.notionDatabaseId === node.id);
        const database: AppDatabase = {
          id: existingDb?.id ?? `db_${nanoid(8)}`,
          name: node.title,
          icon: node.icon ?? "🗂️",
          description: "Importada do Notion.",
          notebookId: placement.notebookId,
          parentPageId: placement.parentPageId,
          notionDatabaseId: node.id,
          deletedAt: null,
          createdAt: existingDb?.createdAt ?? nowMs(),
          updatedAt: nowMs(),
          properties: [
            { id: "p_title", name: "Nome", type: "title", order: 0, width: 300, notionPropertyId: "title" },
            {
              id: "p_status",
              name: "Status",
              type: "select",
              order: 1,
              width: 150,
              notionPropertyId: "status",
              options: [
                { id: "s_open", name: "Aberto", color: "#6366F1" },
                { id: "s_progress", name: "Em progresso", color: "#F59E0B" },
                { id: "s_closed", name: "Fechado", color: "#10B981" },
              ],
            },
            { id: "p_notes", name: "Notas", type: "text", order: 2, width: 260, notionPropertyId: "notes" },
            { id: "p_date", name: "Atualizado", type: "date", order: 3, width: 140, notionPropertyId: "date" },
          ],
          views: [
            { id: "v_table", name: "Tabela", type: "table" },
            { id: "v_kanban", name: "Kanban", type: "kanban", groupByPropertyId: "p_status" },
          ],
          rows: Array.from({ length: Math.min(node.childCount ?? 6, 8) }).map((_, rowIndex) => ({
            id: `row_${nanoid(6)}`,
            order: rowIndex,
            createdAt: nowMs(),
            updatedAt: nowMs(),
            notionPageId: `${node.id}_row_${rowIndex}`,
            values: {
              p_title: `${node.title} - registro ${rowIndex + 1}`,
              p_status: ["Aberto", "Em progresso", "Fechado"][rowIndex % 3],
              p_notes: "Propriedade convertida a partir do rich_text do Notion.",
              p_date: new Date(nowMs() - rowIndex * 86_400_000).toISOString().slice(0, 10),
            },
          })),
        };
        if (existingDb) {
          Object.assign(existingDb, database);
        } else {
          this.state.databases.push(database);
        }
        notionToAppId.set(node.id, database.id);
      } else {
        this.state.notebooks = this.state.notebooks.filter((nb) => nb.notionPageId !== node.id);
        this.state.databases = this.state.databases.filter((d) => d.notionDatabaseId !== node.id);
        const existingPage = this.state.pages.find((p) => p.notionPageId === node.id);
        const parentPage = placement.parentPageId
          ? this.state.pages.find((p) => p.id === placement.parentPageId)
          : undefined;
        const page: Page = {
          id: existingPage?.id ?? `page_${nanoid(10)}`,
          title: node.title,
          icon: node.icon ?? "📄",
          coverUrl: null,
          notebookId: placement.notebookId,
          parentPageId: placement.parentPageId,
          path: parentPage ? [...parentPage.path, parentPage.id] : [],
          blocks,
          plainText: plainTextOf(blocks),
          extractedOCRText: "",
          transcriptText: "",
          tags: ["notion"],
          outgoingLinks: [],
          backlinks: [],
          embedding: null,
          embeddingUpdatedAt: null,
          favorite: false,
          archived: false,
          deletedAt: null,
          notionPageId: node.id,
          notionUrl: `https://www.notion.so/${node.id.replace(/_/g, "")}`,
          importJobId: jobId,
          createdBy: "demo-user",
          updatedBy: "demo-user",
          createdAt: existingPage?.createdAt ?? nowMs(),
          updatedAt: nowMs(),
          order: existingPage?.order ?? this.state.pages.length,
        };
        if (existingPage) {
          Object.assign(existingPage, page);
        } else {
          this.state.pages.push(page);
        }
        notionToAppId.set(node.id, page.id);
      }

      const files = item.fileCount ?? 0;
      const items = current.items.map((it, i) =>
        i === index
          ? { ...it, status: "done" as const, appId: notionToAppId.get(it.notionId) }
          : i === index + 1
            ? { ...it, status: "processing" as const }
            : it
      );

      index += 1;
      this.patchJob(jobId, {
        status: "running",
        currentStep:
          index < current.items.length
            ? `Convertendo “${current.items[index].title}”…`
            : "Finalizando índices e backlinks…",
        processedPages: index,
        processedFiles: Math.min(current.processedFiles + files, current.totalFiles),
        totalBytes: current.totalBytes + files * 184_320,
        items,
      });

      this.timers.set(jobId, setTimeout(step, 520 + Math.random() * 420));
    };

    this.timers.set(jobId, setTimeout(step, 900));
  }


  async uploadAudioNote(_pageId: string, blob: Blob, _durationSeconds: number): Promise<{ url: string; storagePath: string }> {
    const url = await toPersistableUrl(blob);
    const storagePath = `local-audio-${Date.now()}-${nanoid(6)}.webm`;
    return { url, storagePath };
  }

  async saveAudioNote(pageId: string, blob: Blob, durationSeconds: number) {
    const page = this.state.pages.find((p) => p.id === pageId);
    if (!page) return;
    const url = await toPersistableUrl(blob);
    const blockId = `blk_${nanoid(8)}`;
    const blocks = [
      ...page.blocks,
      {
        id: blockId,
        type: "audio" as const,
        media: {
          url,
          name: `voice-note-${new Date().toLocaleTimeString()}.webm`,
          mimeType: blob.type || "audio/webm",
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
  ): Promise<{ url: string; storagePath?: string }> {
    file = await prepareEditorAttachment(file);
    const url = await toPersistableUrl(file);
    onProgress?.(100);
    return { url };
  }

  async saveAttachment(pageId: string, file: File) {
    const { url } = await this.uploadAttachment(pageId, file);
    const page = this.state.pages.find((p) => p.id === pageId);
    if (!page) return;
    const isImage = file.type.startsWith("image/");
    const blockId = `blk_${nanoid(8)}`;
    const blocks = [
      ...page.blocks,
      {
        id: blockId,
        type: (isImage ? "image" : "file") as "image" | "file",
        media: {
          url,
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
    return toPersistableUrl(file);
  }

  async deleteMedia(storagePaths: string[], _pageId?: string): Promise<void> {
    void storagePaths;
  }

  async quarantineMedia(storagePaths: string[], _pageId?: string): Promise<void> {
    void storagePaths;
    void _pageId;
  }

  /** No modo local a midia vive em data URLs dentro do proprio bloco: nada a copiar. */
  async copyMedia(_target: MediaCopyTarget, _sources: string[]): Promise<Record<string, CopiedMedia>> {
    void _target;
    void _sources;
    return {};
  }

  async unquarantineMedia(storagePaths: string[]): Promise<void> {
    void storagePaths;
  }

  subscribeFlashcards(cb: (cards: Flashcard[]) => void): Unsubscribe {
    return this.subscribe(() => cb(this.state.flashcards ?? []));
  }

  async listPageFlashcards(pageId: string): Promise<Flashcard[]> {
    return (this.state.flashcards ?? []).filter((card) => card.pageId === pageId);
  }

  async createFlashcard(input: CreateFlashcardInput): Promise<Flashcard> {
    const now = nowMs();
    const card: Flashcard = {
      id: `fc_${nanoid()}`,
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
      createdBy: "demo-user",
    };
    this.state.flashcards = [card, ...(this.state.flashcards ?? [])];
    this.emit();
    return card;
  }

  async updateFlashcard(id: string, patch: Partial<Flashcard>): Promise<void> {
    this.state.flashcards = (this.state.flashcards ?? []).map((c) => {
      if (c.id !== id) return c;
      const next = { ...c, ...patch, id: c.id, createdAt: c.createdAt, updatedAt: nowMs() };
      // Espelha o deleteField() do Firestore: undefined limpa o campo opcional.
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) delete (next as Record<string, unknown>)[key];
      }
      return next;
    });
    this.emit();
  }

  async deleteFlashcard(id: string): Promise<void> {
    this.state.flashcards = (this.state.flashcards ?? []).filter((c) => c.id !== id);
    this.emit();
  }

  async deleteFlashcardsByPage(pageId: string): Promise<number> {
    const before = (this.state.flashcards ?? []).length;
    this.state.flashcards = (this.state.flashcards ?? []).filter(
      (card) => card.pageId !== pageId
    );
    const removed = before - this.state.flashcards.length;
    if (removed > 0) this.emit();
    return removed;
  }

  async reviewFlashcard(id: string, rating: FlashcardRating, modifier = 1.0): Promise<void> {
    const card = (this.state.flashcards ?? []).find((c) => c.id === id);
    if (!card) return;
    const res = calculateNextReview(card, rating, modifier);
    this.state.flashcards = (this.state.flashcards ?? []).map((c) =>
      c.id === id
        ? {
            ...c,
            repetition: res.repetition,
            interval: res.interval,
            easeFactor: res.easeFactor,
            nextReviewDate: res.nextReviewDate,
            lastReviewedAt: nowMs(),
            updatedAt: nowMs(),
          }
        : c
    );
    this.emit();
  }

  async resetFlashcardsProgress(scope?: FlashcardResetScope): Promise<number> {
    const now = nowMs();
    const allowed = scope?.cardIds ? new Set(scope.cardIds) : null;
    let count = 0;
    this.state.flashcards = (this.state.flashcards ?? []).map((card) => {
      if (allowed && !allowed.has(card.id)) return card;
      if (scope?.pageId && card.pageId !== scope.pageId) return card;
      if (scope && "notebookId" in scope && card.notebookId !== (scope.notebookId ?? null)) {
        return card;
      }
      count += 1;
      return {
        ...card,
        repetition: 0,
        interval: 1,
        easeFactor: 2.5,
        nextReviewDate: now,
        lastReviewedAt: null,
        updatedAt: now,
      };
    });
    if (count > 0) this.emit();
    return count;
  }

  async uploadFlashcardImage(pageId: string, cardId: string, file: File): Promise<{ url: string; storagePath?: string }> {
    // Mesmo preparo do editor. Aqui e ainda mais critico: o modo local guarda a
    // imagem embutida no localStorage, que estoura rapido sem compressao.
    const prepared = await prepareEditorAttachment(file);
    const url = await toPersistableUrl(prepared);
    const ext = prepared.name.split(".").pop() || "jpg";
    const storagePath = `workspaces/${this.workspaceId}/uploads/${pageId}/fc_${cardId}_${nowMs()}.${ext}`;
    return { url, storagePath };
  }
}

let singleton: LocalAdapter | null = null;

export function getLocalAdapter(): LocalAdapter {
  if (!singleton) singleton = new LocalAdapter();
  return singleton;
}
