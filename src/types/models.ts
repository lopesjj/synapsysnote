
export type ISOTimestamp = number; 


export interface RichTextAnnotations {
  bold?: boolean;
  italic?: boolean;
  strikethrough?: boolean;
  underline?: boolean;
  code?: boolean;
  color?: string;
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
  url: string;
  storagePath?: string;
  name?: string;
  mimeType?: string;
  sizeBytes?: number;
  width?: number;
  height?: number;
  displayWidth?: number;
  durationSeconds?: number;
  caption?: RichTextSpan[];
  transcript?: string;
  transcriptSummary?: string;
  pending?: boolean;
}

export interface TableCell {
  spans: RichTextSpan[];
  horizontalAlign?: "left" | "center" | "right";
  verticalAlign?: "top" | "middle" | "bottom";
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
    open?: boolean;
    language?: string;
    autoDetect?: boolean;
    emoji?: string;
    color?: string;
    backgroundColor?: string;
    expression?: string;
    url?: string;
    title?: string;
    targetId?: string;
    tableRows?: TableRow[];
    hasColumnHeader?: boolean;
    colWidths?: number[];
    rowHeights?: number[];
    indentFirst?: boolean;
    indent?: number;
    textAlign?: "left" | "center" | "right" | "justify";
  };
  media?: BlockMedia;
  notionBlockId?: string;
}


export type ThemePreference = "dark" | "light";
export type NotesLayoutPreference = "list" | "cards" | "split";
export type NotesSortPreference = "updated" | "created" | "title";
export type NotesDensityPreference = "comfortable" | "compact";
export type EditorWidthPreference = "narrow" | "normal" | "wide";

export interface UserPreferences {
  theme?: ThemePreference;
  sidebarCollapsed?: boolean;
  sidebarWidth?: number;
  notesLayout?: NotesLayoutPreference;
  notesSort?: NotesSortPreference;
  notesSortDirection?: "asc" | "desc";
  notesDensity?: NotesDensityPreference;
  editorFontId?: string;
  editorFontSize?: number;
  editorWidth?: EditorWidthPreference;
  showSaveIndicator?: boolean;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  phone?: string;
  photoURL?: string | null;
  providers?: string[];
  registrationCompleted?: boolean;
  preferences: UserPreferences;
  createdAt: ISOTimestamp;
  updatedAt: ISOTimestamp;
  lastSeenAt?: ISOTimestamp;
}


export type MemberRole = "owner" | "admin" | "editor" | "viewer";

export interface Workspace {
  id: string;
  name: string;
  emoji?: string;
  ownerId: string;
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
  parentId?: string | null;
  order: number;
  notionPageId?: string | null;
  createdAt: ISOTimestamp;
  updatedAt: ISOTimestamp;
}


export interface Page {
  id: string;
  title: string;
  icon?: string;
  coverUrl?: string | null;
  notebookId: string | null;
  parentPageId: string | null;
  path: string[];
  blocks: AppBlock[];
  plainText: string;
  extractedOCRText?: string;
  transcriptText: string;
  tags: string[];
  outgoingLinks: string[];
  backlinks: string[];
  hasUnresolvedMentions?: boolean;
  embedding?: number[] | null;
  embeddingUpdatedAt?: ISOTimestamp | null;
  favorite: boolean;
  archived: boolean;
  deletedAt: ISOTimestamp | null;
  notionPageId?: string | null;
  notionUrl?: string | null;
  importJobId?: string | null;
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


export interface NotionIntegration {
  id: "notion";
  provider: "notion";
  connected: boolean;
  workspaceName: string;
  workspaceIcon?: string | null;
  notionWorkspaceId: string;
  botId?: string;
  accessTokenCipher?: string;
  tokenPreview?: string;
  scopes?: string[];
  connectedBy: string;
  notionOwnerId?: string | null;
  connectedAt: ISOTimestamp;
  lastSyncAt?: ISOTimestamp | null;
  revokedAt?: ISOTimestamp | null;
  notionBacklinksIndexed?: boolean;
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
    createBacklinks: boolean;
  };
  requestedBy: string;
  startedAt: ISOTimestamp | null;
  finishedAt: ISOTimestamp | null;
  createdAt: ISOTimestamp;
  updatedAt: ISOTimestamp;
}

export interface NotionTreeNode {
  id: string;
  title: string;
  type: "page" | "database";
  icon?: string | null;
  lastEditedTime?: string;
  childCount?: number;
  children?: NotionTreeNode[];
}


export interface SearchHit {
  id: string;
  kind: "page" | "notebook" | "database" | "attachment";
  title: string;
  snippet: string;
  score: number;
  matchedIn: ("title" | "body" | "transcript" | "tag")[];
  notebookId?: string | null;
  icon?: string | null;
}
