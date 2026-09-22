import type { AppBlock } from "@/types/models";

export type ImportSourceKind = "evernote" | "docx" | "google-docs" | "html";

export const MAX_IMPORT_FILE_BYTES = 200 * 1024 * 1024;

export type ImportWarningCode =
  | "encrypted_content"
  | "missing_asset"
  | "remote_asset"
  | "nested_table"
  | "unsupported_content";

export interface ImportedAsset {
  id: string;
  name: string;
  mimeType: string;
  bytes: Uint8Array;
}

export interface ImportedNote {
  sourceId: string;
  title: string;
  blocks: AppBlock[];
  tags: string[];
  assets: ImportedAsset[];
  source: ImportSourceKind;
  sourceFileName: string;
  containerPath?: string[];
  warnings: ImportWarningCode[];
  createdAt?: number;
  updatedAt?: number;
}

export const ASSET_URL_PREFIX = "synapsys-import-asset:";

export function assetUrl(assetId: string): string {
  return `${ASSET_URL_PREFIX}${assetId}`;
}

export function isAssetUrl(url: string | undefined | null): boolean {
  return typeof url === "string" && url.startsWith(ASSET_URL_PREFIX);
}

export function assetIdFromUrl(url: string): string {
  return url.slice(ASSET_URL_PREFIX.length);
}

export class ImportError extends Error {
  constructor(
    readonly code: ImportErrorCode,
    message: string
  ) {
    super(message);
    this.name = "ImportError";
  }
}

export type ImportErrorCode =
  | "unsupported_file"
  | "corrupted_file"
  | "empty_file"
  | "file_too_large"
  | "invalid_google_doc_url"
  | "google_doc_not_public"
  | "google_doc_unavailable";
