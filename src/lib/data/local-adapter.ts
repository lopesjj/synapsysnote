"use client";

import { nanoid } from "nanoid";
import type {
  AppDatabase,
  DatabaseRow,
  ImportJob,
  ImportJobItem,
  Notebook,
  NotionIntegration,
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
import type { CreateImportJobInput, CreatePageInput, DataAdapter, Unsubscribe } from "./adapter";
import { buildSeed, plainTextOf } from "./seed";

/**
 * ETAPA 2 — Credential-free adapter.
 *
 * Mirrors the Firestore adapter's reactive contract on top of localStorage, and
 * runs an in-browser stand-in for `processNotionImportJob` so the wizard,
 * progress document and converted output behave exactly like production.
 */

const STORAGE_KEY = "synapsys.workspace.v1";

interface LocalState {
  notebooks: Notebook[];
  pages: Page[];
  databases: AppDatabase[];
  jobs: ImportJob[];
  versions: PageVersion[];
  integration: NotionIntegration | null;
}

type Listener = () => void;

function nowMs() {
  return Date.now();
}

/**
 * Object URLs die on reload, which would leave demo attachments broken. Small
 * files are inlined as data URLs so they survive; large ones keep the object URL
 * rather than blowing the localStorage quota.
 */
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

  /* ----------------------------------------------------------- persistence */

  private load(): LocalState {
    if (typeof window !== "undefined") {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as LocalState;
          if (parsed.pages?.length) {
            return {
              ...parsed,
              versions: parsed.versions ?? [],
              jobs: parsed.jobs ?? [],
              integration: parsed.integration ?? null,
            };
          }
        } catch {
          // fall through to a fresh seed
        }
      }
    }
    const seed = buildSeed();
    return { ...seed, jobs: [], versions: [], integration: null };
  }

  private persist() {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      // Quota exceeded — the in-memory state stays authoritative for the session.
    }
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
    this.state = { ...seed, jobs: [], versions: [], integration: null };
    this.emit();
  }

  async ensureWorkspace() {
    /* Demo workspace is seeded in the constructor. */
  }

  /* ------------------------------------------------------------ read paths */

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

  /* ----------------------------------------------------------- notebooks */

  async createNotebook(input: { name: string; emoji?: string; color?: string }): Promise<Notebook> {
    const notebook: Notebook = {
      id: `nb_${nanoid(8)}`,
      name: input.name,
      emoji: input.emoji ?? "📓",
      color: input.color ?? "#6366F1",
      order: this.state.notebooks.length,
      createdAt: nowMs(),
      updatedAt: nowMs(),
    };
    this.state.notebooks.push(notebook);
    this.emit();
    return notebook;
  }

  async updateNotebook(id: string, patch: Partial<Notebook>) {
    this.state.notebooks = this.state.notebooks.map((n) =>
      n.id === id ? { ...n, ...patch, updatedAt: nowMs() } : n
    );
    this.emit();
  }

  async deleteNotebook(id: string) {
    this.state.notebooks = this.state.notebooks.filter((n) => n.id !== id);
    this.state.pages = this.state.pages.map((p) =>
      p.notebookId === id ? { ...p, notebookId: null } : p
    );
    this.emit();
  }

  /* --------------------------------------------------------------- pages */

  async createPage(input: CreatePageInput): Promise<Page> {
    const parent = input.parentPageId
      ? this.state.pages.find((p) => p.id === input.parentPageId)
      : null;
    const blocks = input.blocks ?? [
      { id: `blk_${nanoid(8)}`, type: "paragraph" as const, richText: [{ text: "" }] },
    ];
    const page: Page = {
      id: `page_${nanoid(10)}`,
      title: input.title ?? "Sem título",
      icon: input.icon ?? "📄",
      coverUrl: null,
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

  async updatePage(id: string, patch: Partial<Page>) {
    this.state.pages = this.state.pages.map((page) => {
      if (page.id !== id) return page;
      const next = { ...page, ...patch, updatedAt: nowMs(), updatedBy: "demo-user" };
      if (patch.blocks) next.plainText = plainTextOf(patch.blocks);
      return next;
    });
    this.reindexBacklinks();
    this.emit();
  }

  /** Keeps `backlinks` as the exact inverse of `outgoingLinks`. */
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

  async movePage(id: string, target: { notebookId?: string | null; parentPageId?: string | null }) {
    const parent = target.parentPageId
      ? this.state.pages.find((p) => p.id === target.parentPageId)
      : null;
    await this.updatePage(id, {
      notebookId: target.notebookId !== undefined ? target.notebookId : undefined,
      parentPageId: target.parentPageId ?? null,
      path: parent ? [...parent.path, parent.id] : [],
    });
  }

  async trashPage(id: string) {
    const descendants = this.state.pages.filter((p) => p.path.includes(id) || p.id === id);
    for (const page of descendants) {
      this.state.pages = this.state.pages.map((p) =>
        p.id === page.id ? { ...p, deletedAt: nowMs() } : p
      );
    }
    this.emit();
  }

  async restorePage(id: string) {
    this.state.pages = this.state.pages.map((p) => (p.id === id ? { ...p, deletedAt: null } : p));
    this.emit();
  }

  async purgePage(id: string) {
    this.state.pages = this.state.pages.filter((p) => p.id !== id);
    this.emit();
  }

  /* ------------------------------------------------------------ versions */

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
    // Keep the local demo bounded; production trims by TTL policy instead.
    this.state.versions = this.state.versions.slice(-120);
    this.emit();
  }

  async restoreVersion(pageId: string, versionId: string) {
    const version = this.state.versions.find((v) => v.id === versionId);
    if (!version) return;
    await this.updatePage(pageId, { title: version.title, blocks: version.blocks });
  }

  /* ----------------------------------------------------------- databases */

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

  /* --------------------------------------------------------------- Notion */

  async fetchNotionTree(): Promise<NotionTreeNode[]> {
    // Network shape parity: the wizard shows a skeleton while this resolves.
    await new Promise((resolve) => setTimeout(resolve, 420));
    return NOTION_MOCK_TREE;
  }

  async connectNotion() {
    await new Promise((resolve) => setTimeout(resolve, 600));
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

  /**
   * In-browser stand-in for the Cloud Function worker. It walks the selection in
   * the same order the real pipeline does — discover, convert, rehost media,
   * write — and updates the job document after every item so the wizard's
   * real-time listener has something to render.
   */
  private runSimulatedWorker(jobId: string) {
    const job = this.state.jobs.find((j) => j.id === jobId);
    if (!job) return;

    const parents = parentMap(NOTION_MOCK_TREE);
    const notionToAppId = new Map<string, string>();
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
      const parentNotionId = parents[item.notionId] ?? null;
      const parentAppId =
        current.options.preserveHierarchy && parentNotionId
          ? notionToAppId.get(parentNotionId) ?? null
          : null;

      if (node.type === "database") {
        const database: AppDatabase = {
          id: `db_${nanoid(8)}`,
          name: node.title,
          icon: node.icon ?? "🗂️",
          description: "Importada do Notion.",
          notebookId: current.targetNotebookId,
          parentPageId: parentAppId,
          notionDatabaseId: node.id,
          deletedAt: null,
          createdAt: nowMs(),
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
              p_title: `${node.title} — registro ${rowIndex + 1}`,
              p_status: ["Aberto", "Em progresso", "Fechado"][rowIndex % 3],
              p_notes: "Propriedade convertida a partir do rich_text do Notion.",
              p_date: new Date(nowMs() - rowIndex * 86_400_000).toISOString().slice(0, 10),
            },
          })),
        };
        this.state.databases.push(database);
        notionToAppId.set(node.id, database.id);
      } else {
        const parentPage = parentAppId
          ? this.state.pages.find((p) => p.id === parentAppId)
          : undefined;
        const page: Page = {
          id: `page_${nanoid(10)}`,
          title: node.title,
          icon: node.icon ?? "📄",
          coverUrl: null,
          notebookId: current.targetNotebookId,
          parentPageId: parentAppId,
          path: parentPage ? [...parentPage.path, parentPage.id] : [],
          blocks,
          plainText: plainTextOf(blocks),
          extractedOCRText: current.options.runOcr
            ? "Texto extraído por OCR do anexo importado (demonstração)."
            : "",
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
          createdAt: nowMs(),
          updatedAt: nowMs(),
          order: this.state.pages.length,
        };
        this.state.pages.push(page);
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

  /* ---------------------------------------------------------------- media */

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
          name: `nota-de-voz-${new Date().toLocaleTimeString("pt-BR")}.webm`,
          mimeType: blob.type || "audio/webm",
          sizeBytes: blob.size,
          durationSeconds,
          pending: true,
        },
      },
    ];
    await this.updatePage(pageId, { blocks });

    // Stand-in for the Gemini transcription function.
    setTimeout(() => {
      const target = this.state.pages.find((p) => p.id === pageId);
      if (!target) return;
      const transcript =
        "Transcrição de demonstração: a nota de voz foi processada localmente. Conecte o Firebase para usar o Gemini e obter a transcrição real com marcações de tempo.";
      const summary = "Resumo: nota de voz capturada no app; pendente de revisão.";
      const nextBlocks = target.blocks.map((b) =>
        b.id === blockId && b.media
          ? { ...b, media: { ...b.media, pending: false, transcript, transcriptSummary: summary } }
          : b
      );
      void this.updatePage(pageId, {
        blocks: nextBlocks,
        transcriptText: `${target.transcriptText}\n${transcript}`.trim(),
      });
    }, 2200);
  }

  async saveAttachment(pageId: string, file: File) {
    const page = this.state.pages.find((p) => p.id === pageId);
    if (!page) return;
    const url = await toPersistableUrl(file);
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
          pending: isImage,
        },
      },
    ];
    await this.updatePage(pageId, { blocks });

    if (!isImage) return;
    // Stand-in for the Cloud Vision OCR function.
    setTimeout(() => {
      const target = this.state.pages.find((p) => p.id === pageId);
      if (!target) return;
      const ocrText = `Texto reconhecido em ${file.name} (demonstração). Com o Firebase conectado, a Cloud Vision devolve o texto real e ele passa a ser pesquisável.`;
      const nextBlocks = target.blocks.map((b) =>
        b.id === blockId && b.media ? { ...b, media: { ...b.media, pending: false, ocrText } } : b
      );
      void this.updatePage(pageId, {
        blocks: nextBlocks,
        extractedOCRText: `${target.extractedOCRText}\n${ocrText}`.trim(),
      });
    }, 1800);
  }
}

let singleton: LocalAdapter | null = null;

export function getLocalAdapter(): LocalAdapter {
  if (!singleton) singleton = new LocalAdapter();
  return singleton;
}
