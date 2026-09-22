import type {
  AppDatabase,
  CreateFlashcardInput,
  DatabaseRow,
  Flashcard,
  FlashcardRating,
  ImportJob,
  ImportJobItem,
  ImportJobStatus,
  Notebook,
  NotionIntegration,
  GoogleDocsIntegration,
  EvernoteIntegration,
  CloudIntegration,
  NotionTreeNode,
  Page,
  PageVersion,
} from "@/types/models";

export type Unsubscribe = () => void;

export interface CreatePageInput {
  title?: string;
  icon?: string;
  coverUrl?: string | null;
  coverPosition?: number | null;
  notebookId?: string | null;
  parentPageId?: string | null;
  blocks?: Page["blocks"];
  tags?: string[];
  importSource?: Page["importSource"];
}

export interface CreateImportJobInput {
  selection: { notionIds: string[]; importAll: boolean };
  targetNotebookId: string | null;
  options: ImportJob["options"];
  items: { notionId: string; title: string; type: "page" | "database" }[];
}

export interface RecordImportJobInput {
  provider: string;
  title: string;
  totalPages: number;
  processedPages: number;
  totalFiles: number;
  processedFiles: number;
  status: ImportJobStatus;
  items?: ImportJobItem[];
}

export type { CreateFlashcardInput };

export interface FlashcardResetScope {
  cardIds?: string[];
  pageId?: string;
  notebookId?: string | null;
}

export interface DataAdapter {
  readonly mode: "firestore" | "local";
  readonly workspaceId: string;

  ensureWorkspace(): Promise<void>;

  subscribeNotebooks(cb: (notebooks: Notebook[]) => void): Unsubscribe;
  subscribePages(cb: (pages: Page[]) => void): Unsubscribe;
  subscribeDatabases(cb: (databases: AppDatabase[]) => void): Unsubscribe;
  subscribeImportJobs(cb: (jobs: ImportJob[]) => void): Unsubscribe;
  subscribeIntegration(cb: (integration: NotionIntegration | null) => void): Unsubscribe;
  subscribeCloudIntegration?(provider: "notion" | "google-docs" | "evernote", cb: (integration: CloudIntegration | null) => void): Unsubscribe;

  duplicateNotebook(id: string): Promise<Notebook>;
  createNotebook(input: {
    name: string;
    emoji?: string;
    color?: string;
    parentId?: string | null;
  }): Promise<Notebook>;
  updateNotebook(id: string, patch: Partial<Notebook>): Promise<void>;
  moveNotebook(id: string, target: { parentId: string | null; order?: number }): Promise<void>;
  deleteNotebook(id: string): Promise<void>;

  createPage(input: CreatePageInput): Promise<Page>;
  duplicatePage(id: string): Promise<Page>;
  updatePage(id: string, patch: Partial<Page>): Promise<void>;
  applyPageOrders(updates: { id: string; order: number }[]): Promise<void>;
  applyNotebookOrders(updates: { id: string; order: number }[]): Promise<void>;
  movePage(id: string, target: { notebookId?: string | null; parentPageId?: string | null; order?: number }): Promise<void>;
  trashPage(id: string): Promise<void>;
  restorePage(id: string): Promise<void>;
  purgePage(id: string): Promise<void>;
  emptyTrash(): Promise<void>;

  listVersions(pageId: string): Promise<PageVersion[]>;
  snapshotVersion(pageId: string, label?: string): Promise<void>;
  restoreVersion(pageId: string, versionId: string): Promise<void>;

  createDatabase(input: { name: string; notebookId?: string | null }): Promise<AppDatabase>;
  updateDatabase(id: string, patch: Partial<AppDatabase>): Promise<void>;
  upsertRow(databaseId: string, row: Partial<DatabaseRow> & { id?: string }): Promise<DatabaseRow>;
  deleteRow(databaseId: string, rowId: string): Promise<void>;

  fetchNotionTree(): Promise<NotionTreeNode[]>;
  createImportJob(input: CreateImportJobInput): Promise<string>;
  recordCompletedImportJob?(input: RecordImportJobInput): Promise<string>;
  resumeImportJob?(jobId: string): Promise<void>;
  cancelImportJob(jobId: string): Promise<void>;

  connectNotion(): Promise<{ redirectUrl: string } | { connected: NotionIntegration }>;
  disconnectNotion(): Promise<void>;
  connectGoogleDocs?(input?: {
    accessToken?: string;
    accountEmail?: string;
    accountName?: string;
    avatarUrl?: string;
  }): Promise<{ redirectUrl?: string } | { connected: GoogleDocsIntegration }>;
  disconnectGoogleDocs?(): Promise<void>;
  connectEvernote?(): Promise<{ redirectUrl?: string } | { connected: EvernoteIntegration }>;
  disconnectEvernote?(): Promise<void>;

  saveAudioNote(pageId: string, blob: Blob, durationSeconds: number): Promise<void>;
  uploadAudioNote(pageId: string, blob: Blob, durationSeconds: number): Promise<{ url: string; storagePath?: string }>;
  retryMediaProcessing(pageId: string, storagePath: string): Promise<void>;
  saveAttachment(pageId: string, file: File): Promise<void>;
  uploadAttachment(
    pageId: string,
    file: File,
    onProgress?: (percent: number) => void
  ): Promise<{ url: string; storagePath?: string }>;

  uploadWorkspaceIcon(file: File): Promise<string>;
  deleteMedia(storagePaths: string[], pageId?: string): Promise<void>;
  quarantineMedia(storagePaths: string[], pageId?: string): Promise<void>;
  unquarantineMedia(storagePaths: string[]): Promise<void>;

  subscribeFlashcards(cb: (cards: Flashcard[]) => void): Unsubscribe;
  listPageFlashcards(pageId: string): Promise<Flashcard[]>;
  createFlashcard(input: CreateFlashcardInput): Promise<Flashcard>;
  updateFlashcard(id: string, patch: Partial<Flashcard>): Promise<void>;
  deleteFlashcard(id: string): Promise<void>;
  /** Apaga todos os cards de uma nota e as imagens deles. Devolve quantos saíram. */
  deleteFlashcardsByPage(pageId: string): Promise<number>;
  reviewFlashcard(id: string, rating: FlashcardRating, modifier?: number): Promise<void>;
  resetFlashcardsProgress(scope?: FlashcardResetScope): Promise<number>;
  uploadFlashcardImage(pageId: string, cardId: string, file: File): Promise<{ url: string; storagePath?: string }>;
}
