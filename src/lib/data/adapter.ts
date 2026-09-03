import type {
  AppBlock,
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

/* -------------------------------------------------------------------------- */
/* Client-side bulk import (Notion .zip)                                       */
/* -------------------------------------------------------------------------- */

/** A media file that has been rehosted and can be linked from a block. */
export interface ImportedAsset {
  url: string;
  storagePath?: string;
}

/**
 * Notebooks and pages are described with importer-local `key`s because the
 * hierarchy is known before any document exists. `commitImportedTree` allocates
 * the real ids and returns the mapping, which is what lets the importer rewrite
 * cross-page links after the fact.
 */
export interface NotebookDraft {
  key: string;
  name: string;
  emoji?: string;
  order?: number;
}

export interface PageDraft {
  key: string;
  notebookKey: string | null;
  parentKey: string | null;
  title: string;
  icon?: string;
  blocks: AppBlock[];
  tags?: string[];
  order?: number;
  /** Where the page came from, shown as a badge in the editor. */
  importSource?: Page["importSource"];
}

export interface CommittedTree {
  /** Draft key → Firestore document id. */
  notebookIds: Record<string, string>;
  pageIds: Record<string, string>;
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

  /**
   * Rehosts one media file extracted from a `.zip`, without attaching it to a
   * page — the importer links it from a block it is still assembling.
   */
  uploadImportAsset(input: {
    fileName: string;
    blob: Blob;
    contentType?: string;
  }): Promise<ImportedAsset>;

  /**
   * Writes a whole imported hierarchy transactionally. Firestore commits in
   * batches so a failure cannot leave a half-imported notebook behind.
   */
  commitImportedTree(input: {
    notebooks: NotebookDraft[];
    pages: PageDraft[];
  }): Promise<CommittedTree>;
}
