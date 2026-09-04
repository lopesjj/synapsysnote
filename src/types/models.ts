/**
 * ETAPA 1 — Canonical domain model.
 *
 * Every interface below maps 1:1 to a Firestore document shape. The same types
 * are consumed by the Next.js client, by the Cloud Functions import pipeline and
 * by the local (credential-free) demo adapter, so the conversion engine can never
 * drift from what the UI renders.
 */

export type ISOTimestamp = number; // epoch millis — portable between Firestore Timestamp and the local adapter

/* ------------------------------------------------------------------ */
/* Rich text + blocks                                                  */
/* ------------------------------------------------------------------ */

export interface RichTextAnnotations {
  bold?: boolean;
  italic?: boolean;
  strikethrough?: boolean;
  underline?: boolean;
  code?: boolean;
  color?: string;
  /** Background highlight; a CSS color when the user picked one. */
  highlight?: boolean | string;
}

export type MentionTarget =
  | { kind: "page"; pageId: string; label: string }
  | { kind: "user"; userId: string; label: string }
  | { kind: "date"; iso: string; label: string };

export interface RichTextSpan {
  text: string;
  annotations?: RichTextAnnotations;
  href?: string | null;
  mention?: MentionTarget;
}

export type BlockType =
  | "paragraph"
  | "heading_1"
  | "heading_2"
  | "heading_3"
  | "bulleted_list_item"
  | "numbered_list_item"
  | "todo"
  | "toggle"
  | "callout"
  | "quote"
  | "divider"
  | "code"
  | "equation"
  | "image"
  | "video"
  | "audio"
  | "file"
  | "bookmark"
  | "embed"
  | "table"
  | "child_page"
  | "child_database"
  | "unsupported";

export interface BlockMedia {
  /** Permanent Cloud Storage download URL (never a Notion S3 presigned URL). */
  url: string;
  storagePath?: string;
  name?: string;
  mimeType?: string;
  sizeBytes?: number;
  width?: number;
  height?: number;
  /** Visible width as a percent of the editor column (20–100). Aspect ratio stays locked. */
  displayWidth?: number;
  durationSeconds?: number;
  caption?: RichTextSpan[];
  /** Populated asynchronously by the Vision OCR function. */
  ocrText?: string;
  /** Populated asynchronously by the Gemini transcription function. */
  transcript?: string;
  transcriptSummary?: string;
  /** Set while the media pipeline is still rehosting the asset. */
  pending?: boolean;
}

/** One table cell. Objects instead of nested arrays so Firestore can store them. */
export interface TableCell {
  spans: RichTextSpan[];
}

export interface TableRow {
  cells: TableCell[];
}

export interface AppBlock {
  id: string;
  type: BlockType;
  richText?: RichTextSpan[];
  children?: AppBlock[];
  props?: {
    checked?: boolean;
    language?: string;
    /** Keep guessing the code-block language as the user types. */
    autoDetect?: boolean;
    emoji?: string;
    color?: string;
    expression?: string;
    url?: string;
    title?: string;
    /** For child_page / child_database blocks resolved during import. */
    targetId?: string;
    /**
     * Rows as objects — Firestore rejects nested arrays, so this cannot be
     * `RichTextSpan[][][]`.
     */
    tableRows?: TableRow[];
    hasColumnHeader?: boolean;
    /** Word-style first-line indent on paragraphs. */
    indentFirst?: boolean;
    /** Block alignment. Paragraphs default to justify; headings to left. */
    textAlign?: "left" | "center" | "right" | "justify";
  };
  media?: BlockMedia;
  /** Original Notion block id, kept for idempotent re-imports. */
  notionBlockId?: string;
}

/* ------------------------------------------------------------------ */
/* User profile + preferences                                          */
/* ------------------------------------------------------------------ */

export type ThemePreference = "dark" | "light";
export type NotesLayoutPreference = "list" | "cards" | "split";
export type NotesSortPreference = "updated" | "created" | "title";
export type NotesDensityPreference = "comfortable" | "compact";
export type EditorWidthPreference = "narrow" | "normal" | "wide";

/**
 * Interface preferences, stored on the profile document so the workspace looks
 * identical on every device. Every field is optional: an older client that does
 * not know a key must be able to write the document back without erasing it.
 */
export interface UserPreferences {
  theme?: ThemePreference;
  sidebarCollapsed?: boolean;
  sidebarWidth?: number;
  notesLayout?: NotesLayoutPreference;
  notesSort?: NotesSortPreference;
  notesSortDirection?: "asc" | "desc";
  notesDensity?: NotesDensityPreference;
  /** Id from `EDITOR_FONTS` in `src/lib/typography.ts`. */
  editorFontId?: string;
  editorFontSize?: number;
  editorWidth?: EditorWidthPreference;
  showSaveIndicator?: boolean;
}

/** `users/{userId}` — identity shown in the UI plus cross-device preferences. */
export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  /** Brazilian phone as shown in the form, e.g. `(11) 98765-4321`. */
  phone?: string;
  photoURL?: string | null;
  /** Provider ids that can sign this account in (`password`, `google.com`, `github.com`). */
  providers?: string[];
  /**
   * Set when the in-app sign-up (or the first-login complement) finished.
   * Auth-only accounts created in the Firebase console stay false until then.
   */
  registrationCompleted?: boolean;
  preferences: UserPreferences;
  createdAt: ISOTimestamp;
  updatedAt: ISOTimestamp;
  lastSeenAt?: ISOTimestamp;
}

/* ------------------------------------------------------------------ */
/* Workspace + membership                                              */
/* ------------------------------------------------------------------ */

export type MemberRole = "owner" | "admin" | "editor" | "viewer";

export interface Workspace {
  id: string;
  name: string;
  emoji?: string;
  ownerId: string;
  /** Denormalized for `list where memberIds array-contains uid` queries. */
  memberIds: string[];
  plan: "free" | "pro" | "team";
  createdAt: ISOTimestamp;
  updatedAt: ISOTimestamp;
}

export interface Member {
  userId: string;
  email: string;
  displayName: string;
  photoURL?: string | null;
  role: MemberRole;
  joinedAt: ISOTimestamp;
}

export interface Notebook {
  id: string;
  name: string;
  emoji?: string;
  color?: string;
  description?: string;
  coverUrl?: string | null;
  /** Parent notebook — `null` (or missing on older docs) means a root caderno. */
  parentId?: string | null;
  order: number;
  createdAt: ISOTimestamp;
  updatedAt: ISOTimestamp;
}

/* ------------------------------------------------------------------ */
/* Pages                                                               */
/* ------------------------------------------------------------------ */

export interface Page {
  id: string;
  title: string;
  icon?: string;
  coverUrl?: string | null;
  notebookId: string | null;
  parentPageId: string | null;
  /** Materialized ancestor chain — enables one-query subtree reads. */
  path: string[];
  blocks: AppBlock[];
  /** Flattened text used by the client-side full-text index and by search. */
  plainText: string;
  /** Concatenated OCR output of every attachment on the page. */
  extractedOCRText: string;
  /** Concatenated Gemini transcripts of every audio block. */
  transcriptText: string;
  tags: string[];
  /** Page ids this page links to (resolved from mentions on save). */
  outgoingLinks: string[];
  /** Reverse index maintained on save so backlinks are a single read. */
  backlinks: string[];
  /** 768-d Vertex AI embedding stored as a Firestore vector value. */
  embedding?: number[] | null;
  embeddingUpdatedAt?: ISOTimestamp | null;
  favorite: boolean;
  archived: boolean;
  deletedAt: ISOTimestamp | null;
  /** Notion provenance — makes re-imports idempotent. */
  notionPageId?: string | null;
  notionUrl?: string | null;
  importJobId?: string | null;
  /**
   * How the page entered the workspace. `notion-zip` marks the client-side
   * `.zip` importer, which cannot set `notionPageId`/`importJobId` — the
   * security rules reserve those for the server-side pipeline.
   */
  importSource?: "notion-zip" | null;
  createdBy: string;
  updatedBy: string;
  createdAt: ISOTimestamp;
  updatedAt: ISOTimestamp;
  order: number;
}

export interface PageVersion {
  id: string;
  pageId: string;
  title: string;
  blocks: AppBlock[];
  authorId: string;
  label?: string;
  createdAt: ISOTimestamp;
}

/* ------------------------------------------------------------------ */
/* Databases                                                           */
/* ------------------------------------------------------------------ */

export type PropertyType =
  | "title"
  | "text"
  | "number"
  | "select"
  | "multi_select"
  | "date"
  | "checkbox"
  | "url"
  | "email"
  | "phone"
  | "person"
  | "files"
  | "relation"
  | "created_time"
  | "last_edited_time";

export interface SelectOption {
  id: string;
  name: string;
  color?: string;
}

export interface PropertyDef {
  id: string;
  name: string;
  type: PropertyType;
  options?: SelectOption[];
  numberFormat?: "plain" | "percent" | "currency";
  width?: number;
  hidden?: boolean;
  order: number;
  notionPropertyId?: string;
}

export type ViewType = "table" | "kanban" | "gallery" | "calendar";

export interface DatabaseView {
  id: string;
  name: string;
  type: ViewType;
  /** Property used to group Kanban columns (must be `select`). */
  groupByPropertyId?: string;
  sort?: { propertyId: string; direction: "asc" | "desc" }[];
  filters?: { propertyId: string; op: "eq" | "neq" | "contains" | "gt" | "lt"; value: unknown }[];
  visiblePropertyIds?: string[];
}

export type PropertyValue =
  | string
  | number
  | boolean
  | string[]
  | { url: string; name: string }[]
  | null;

export interface DatabaseRow {
  id: string;
  values: Record<string, PropertyValue>;
  /** Rows can expand into a full page. */
  pageId?: string | null;
  order: number;
  notionPageId?: string | null;
  createdAt: ISOTimestamp;
  updatedAt: ISOTimestamp;
}

export interface AppDatabase {
  id: string;
  name: string;
  icon?: string;
  description?: string;
  notebookId: string | null;
  parentPageId: string | null;
  properties: PropertyDef[];
  views: DatabaseView[];
  rows: DatabaseRow[];
  notionDatabaseId?: string | null;
  deletedAt: ISOTimestamp | null;
  createdAt: ISOTimestamp;
  updatedAt: ISOTimestamp;
}

/* ------------------------------------------------------------------ */
/* Integrations + import jobs                                          */
/* ------------------------------------------------------------------ */

export interface NotionIntegration {
  id: "notion";
  provider: "notion";
  connected: boolean;
  workspaceName: string;
  workspaceIcon?: string | null;
  notionWorkspaceId: string;
  botId?: string;
  /** Only ever written by Cloud Functions; AES-256-GCM ciphertext. */
  accessTokenCipher?: string;
  /** Non-secret preview, e.g. `secret_••••4f2a`, safe to show in the UI. */
  tokenPreview?: string;
  scopes?: string[];
  /** Synapsys uid that completed OAuth — the token belongs to this user. */
  connectedBy: string;
  /** Notion user id returned by the token exchange, when present. */
  notionOwnerId?: string | null;
  connectedAt: ISOTimestamp;
  lastSyncAt?: ISOTimestamp | null;
  revokedAt?: ISOTimestamp | null;
}

export type ImportJobStatus =
  | "pending"
  | "discovering"
  | "running"
  | "completed"
  | "completed_with_errors"
  | "failed"
  | "canceled";

export interface ImportJobError {
  itemId: string;
  itemTitle?: string;
  stage: "fetch" | "convert" | "media" | "write";
  message: string;
  at: ISOTimestamp;
}

export interface ImportJobItem {
  notionId: string;
  title: string;
  type: "page" | "database";
  status: "queued" | "processing" | "done" | "error" | "skipped";
  appId?: string;
  fileCount?: number;
  message?: string;
}

export interface ImportJob {
  id: string;
  status: ImportJobStatus;
  /** Free-form human label of what the worker is doing right now. */
  currentStep: string;
  totalPages: number;
  processedPages: number;
  totalFiles: number;
  processedFiles: number;
  totalBytes: number;
  errors: ImportJobError[];
  items: ImportJobItem[];
  selection: { notionIds: string[]; importAll: boolean };
  targetNotebookId: string | null;
  options: {
    downloadMedia: boolean;
    preserveHierarchy: boolean;
    runOcr: boolean;
    createBacklinks: boolean;
  };
  requestedBy: string;
  startedAt: ISOTimestamp | null;
  finishedAt: ISOTimestamp | null;
  createdAt: ISOTimestamp;
  updatedAt: ISOTimestamp;
}

/** Node of the tree rendered by the Import Wizard. */
export interface NotionTreeNode {
  id: string;
  title: string;
  type: "page" | "database";
  icon?: string | null;
  lastEditedTime?: string;
  childCount?: number;
  children?: NotionTreeNode[];
}

/* ------------------------------------------------------------------ */
/* Search                                                              */
/* ------------------------------------------------------------------ */

export interface SearchHit {
  id: string;
  kind: "page" | "database" | "attachment";
  title: string;
  snippet: string;
  score: number;
  matchedIn: ("title" | "body" | "ocr" | "transcript" | "tag")[];
  notebookId?: string | null;
}
