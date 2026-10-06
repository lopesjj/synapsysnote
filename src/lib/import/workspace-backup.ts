import { extractZipJson, type SlicedZipEntry } from "./sliced-zip";

export const WORKSPACE_BACKUP_JSON_NAMES = ["synapsys-workspace.json", "workspace.json", "synapsys-dados.json"];

export interface RestoreSummary {
  workspaceName?: string;
  notebooksCount: number;
  pagesCount: number;
  databasesCount: number;
  databaseRowsCount: number;
  flashcardsCount: number;
  filesCount: number;
}

export interface BackupFileEntry {
  storagePath: string;
  archivePath: string;
  name: string;
  mimeType?: string;
  sizeBytes?: number;
}

export type BackupRecord = Record<string, unknown>;

export interface BackupWorkspaceMeta extends BackupRecord {
  id?: string;
  name?: string;
  emoji?: string;
  language?: string;
}

export interface BackupDatabase extends BackupRecord {
  rows?: unknown[];
}

export interface WorkspaceBackup {
  workspace?: BackupWorkspaceMeta;
  notebooks: BackupRecord[];
  pages: BackupRecord[];
  databases: BackupDatabase[];
  flashcards: BackupRecord[];
  files: BackupFileEntry[];
  study?: Record<string, BackupRecord[]>;
}

function asRecord(value: unknown): BackupRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as BackupRecord) : null;
}

function asRecords(value: unknown): BackupRecord[] {
  return Array.isArray(value) ? value.map(asRecord).filter((entry): entry is BackupRecord => Boolean(entry)) : [];
}

function asFiles(value: unknown): BackupFileEntry[] {
  return asRecords(value)
    .filter((entry) => typeof entry.storagePath === "string" && typeof entry.archivePath === "string")
    .map((entry) => ({
      storagePath: entry.storagePath as string,
      archivePath: entry.archivePath as string,
      name: typeof entry.name === "string" && entry.name ? entry.name : String(entry.storagePath).split("/").pop() || "file",
      mimeType: typeof entry.mimeType === "string" ? entry.mimeType : undefined,
      sizeBytes: typeof entry.sizeBytes === "number" ? entry.sizeBytes : undefined,
    }));
}

function hasContent(source: BackupRecord): boolean {
  return ["pages", "notebooks", "databases"].some((key) => Array.isArray(source[key]) && (source[key] as unknown[]).length > 0);
}

export function normalizeWorkspaceBackup(raw: unknown): WorkspaceBackup | null {
  const root = asRecord(raw);
  if (!root) return null;
  const nested = asRecords(root.workspaces).find(hasContent);
  const source = hasContent(root) ? root : (nested ?? root);
  const study = asRecord(source.study);
  const files = asFiles(source.files).length ? asFiles(source.files) : asFiles(root.files);
  return {
    workspace: (asRecord(source.workspace) as BackupWorkspaceMeta | null) ?? undefined,
    notebooks: asRecords(source.notebooks),
    pages: asRecords(source.pages),
    databases: asRecords(source.databases) as BackupDatabase[],
    flashcards: asRecords(source.flashcards),
    files,
    study: study
      ? Object.fromEntries(Object.entries(study).map(([name, docs]) => [name, asRecords(docs)]))
      : undefined,
  };
}

export function isRestorableBackup(data: WorkspaceBackup | null): data is WorkspaceBackup {
  return Boolean(data && (data.pages.length || data.notebooks.length || data.databases.length));
}

export function summarizeWorkspaceBackup(data: WorkspaceBackup): RestoreSummary {
  return {
    workspaceName: typeof data.workspace?.name === "string" ? data.workspace.name : undefined,
    notebooksCount: data.notebooks.length,
    pagesCount: data.pages.length,
    databasesCount: data.databases.length,
    databaseRowsCount: data.databases.reduce((sum, database) => sum + (Array.isArray(database.rows) ? database.rows.length : 0), 0),
    flashcardsCount: data.flashcards.length,
    filesCount: data.files.length,
  };
}

export async function readWorkspaceBackup(
  file: File | Blob
): Promise<{ data: WorkspaceBackup | null; entries: Map<string, SlicedZipEntry> }> {
  const { data, entries } = await extractZipJson<unknown>(file as File, WORKSPACE_BACKUP_JSON_NAMES);
  return { data: normalizeWorkspaceBackup(data), entries };
}
