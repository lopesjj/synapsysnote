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

export type Unsubscribe = () => void;

export interface CreatePageInput {
  title?: string;
  icon?: string;
  notebookId?: string | null;
  parentPageId?: string | null;
  blocks?: Page["blocks"];
  tags?: string[];
}

export interface CreateImportJobInput {
  selection: { notionIds: string[]; importAll: boolean };
  targetNotebookId: string | null;
  options: ImportJob["options"];
  /** Titles resolved from the wizard tree so progress rows render immediately. */
  items: { notionId: string; title: string; type: "page" | "database" }[];
}

/**
 * ETAPA 2 — Storage-agnostic contract.
 *
 * Two implementations satisfy it:
 *   • `FirestoreAdapter` — production: onSnapshot listeners, offline cache,
 *     Cloud Functions for the heavy lifting.
 *   • `LocalAdapter` — zero-credential demo: same reactive semantics backed by
 *     localStorage, with a simulated import worker so the whole Notion flow can
 *     be exercised end to end before Firebase is provisioned.
 *
 * The UI only ever talks to this interface.
 */
export interface DataAdapter {
  readonly mode: "firestore" | "local";
  readonly workspaceId: string;

  /** Creates the workspace + membership if they do not exist yet. */
  ensureWorkspace(): Promise<void>;

  subscribeNotebooks(cb: (notebooks: Notebook[]) => void): Unsubscribe;
  subscribePages(cb: (pages: Page[]) => void): Unsubscribe;
  subscribeDatabases(cb: (databases: AppDatabase[]) => void): Unsubscribe;
  subscribeImportJobs(cb: (jobs: ImportJob[]) => void): Unsubscribe;
  subscribeIntegration(cb: (integration: NotionIntegration | null) => void): Unsubscribe;

  createNotebook(input: { name: string; emoji?: string; color?: string }): Promise<Notebook>;
  updateNotebook(id: string, patch: Partial<Notebook>): Promise<void>;
  deleteNotebook(id: string): Promise<void>;

  createPage(input: CreatePageInput): Promise<Page>;
  updatePage(id: string, patch: Partial<Page>): Promise<void>;
  movePage(id: string, target: { notebookId?: string | null; parentPageId?: string | null }): Promise<void>;
  trashPage(id: string): Promise<void>;
  restorePage(id: string): Promise<void>;
  purgePage(id: string): Promise<void>;

  listVersions(pageId: string): Promise<PageVersion[]>;
  snapshotVersion(pageId: string, label?: string): Promise<void>;
  restoreVersion(pageId: string, versionId: string): Promise<void>;

  createDatabase(input: { name: string; notebookId?: string | null }): Promise<AppDatabase>;
  updateDatabase(id: string, patch: Partial<AppDatabase>): Promise<void>;
  upsertRow(databaseId: string, row: Partial<DatabaseRow> & { id?: string }): Promise<DatabaseRow>;
  deleteRow(databaseId: string, rowId: string): Promise<void>;

  /** Import Wizard step 1: read the shared Notion tree. */
  fetchNotionTree(): Promise<NotionTreeNode[]>;
  createImportJob(input: CreateImportJobInput): Promise<string>;
  cancelImportJob(jobId: string): Promise<void>;

  connectNotion(): Promise<{ redirectUrl: string } | { connected: NotionIntegration }>;
  disconnectNotion(): Promise<void>;

  /** Voice notes: persists audio and requests transcription. */
  saveAudioNote(pageId: string, blob: Blob, durationSeconds: number): Promise<void>;
  /** Attachments: uploads the file and requests OCR when it is an image/PDF. */
  saveAttachment(pageId: string, file: File): Promise<void>;
}
