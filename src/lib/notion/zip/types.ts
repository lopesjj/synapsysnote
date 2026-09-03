import type JSZip from "jszip";

export interface ZipEntry {
  /** Full path inside the archive. */
  path: string;
  /** Path with the export's wrapper folder removed. */
  relativePath: string;
  segments: string[];
  file: JSZip.JSZipObject;
}

export type ImportStage =
  | "idle"
  | "reading"
  | "analysing"
  | "uploading"
  | "writing"
  | "done"
  | "error";

export interface ImportProgress {
  stage: ImportStage;
  /** What the importer is doing right now, for the status line. */
  step: string;
  notebooks: number;
  pages: number;
  mediaTotal: number;
  mediaUploaded: number;
  /** Non-fatal problems: one bad image must not abort the whole import. */
  warnings: string[];
}

export interface ImportPlanSummary {
  notebooks: { name: string; pages: number }[];
  pageCount: number;
  databaseCount: number;
  mediaCount: number;
  skipped: string[];
}
