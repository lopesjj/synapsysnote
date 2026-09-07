
export interface RichTextSpan {
  text: string;
  annotations?: {
    bold?: boolean;
    italic?: boolean;
    strikethrough?: boolean;
    underline?: boolean;
    code?: boolean;
    color?: string;
  };
  href?: string | null;
  mention?:
    | { kind: "page"; pageId: string; label: string }
    | { kind: "user"; userId: string; label: string }
    | { kind: "date"; iso: string; label: string };
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
  durationSeconds?: number;
  caption?: RichTextSpan[];
  ocrText?: string;
  transcript?: string;
  transcriptSummary?: string;
  pending?: boolean;
}

export interface AppBlock {
  id: string;
  type: BlockType;
  richText?: RichTextSpan[];
  children?: AppBlock[];
  props?: Record<string, unknown>;
  media?: BlockMedia;
  notionBlockId?: string;
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

export interface PropertyDef {
  id: string;
  name: string;
  type: PropertyType;
  options?: { id: string; name: string; color?: string }[];
  order: number;
  width?: number;
  notionPropertyId?: string;
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

export interface ImportJobDoc {
  status:
    | "pending"
    | "discovering"
    | "running"
    | "completed"
    | "completed_with_errors"
    | "failed"
    | "canceled";
  currentStep: string;
  totalPages: number;
  processedPages: number;
  totalFiles: number;
  processedFiles: number;
  totalBytes: number;
  errors: {
    itemId: string;
    itemTitle?: string;
    stage: "fetch" | "convert" | "media" | "write";
    message: string;
    at: number;
  }[];
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
