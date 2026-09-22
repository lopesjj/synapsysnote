import type { Page } from "@/types/models";
import type { TranslationKey } from "@/lib/i18n/translations";

export type ImportOrigin =
  | "notion"
  | "notion_zip"
  | "evernote"
  | "google_docs"
  | "docx"
  | "file";

export type ImportOriginFamily = "notion" | "evernote" | "google_docs" | "docx" | "file";

type PageOriginFields = Pick<Page, "notionPageId" | "importSource">;

const SOURCE_TO_ORIGIN: Record<string, ImportOrigin> = {
  "notion-zip": "notion_zip",
  evernote: "evernote",
  "google-docs": "google_docs",
  docx: "docx",
  html: "file",
};

export const IMPORT_ORIGIN_SHORT_KEY: Record<ImportOrigin, TranslationKey> = {
  notion: "provider_notion",
  notion_zip: "provider_notion",
  evernote: "provider_evernote",
  google_docs: "provider_google_docs",
  docx: "provider_docx",
  file: "provider_file",
};

export const IMPORT_ORIGIN_BADGE_KEY: Record<ImportOrigin, TranslationKey> = {
  notion: "imported_from_notion",
  notion_zip: "imported_from_notion_zip",
  evernote: "imported_from_evernote",
  google_docs: "imported_from_google_docs",
  docx: "imported_from_word",
  file: "imported_from_file",
};

export const IMPORT_FAMILY_FROM_KEY: Record<ImportOriginFamily, TranslationKey> = {
  notion: "from_notion",
  evernote: "from_evernote",
  google_docs: "from_google_docs",
  docx: "from_word",
  file: "from_file",
};

export function pageImportOrigin(page: PageOriginFields): ImportOrigin | null {
  if (page.notionPageId) return "notion";
  const source = page.importSource;
  if (!source) return null;
  return SOURCE_TO_ORIGIN[source] ?? "file";
}

export function importOriginFamily(origin: ImportOrigin): ImportOriginFamily {
  return origin === "notion_zip" ? "notion" : origin;
}

export interface ImportedPagesSummary {
  total: number;
  families: ImportOriginFamily[];
}

export function summarizeImportedPages(pages: PageOriginFields[]): ImportedPagesSummary {
  const families = new Set<ImportOriginFamily>();
  let total = 0;
  for (const page of pages) {
    const origin = pageImportOrigin(page);
    if (!origin) continue;
    total += 1;
    families.add(importOriginFamily(origin));
  }
  return { total, families: [...families] };
}

export function importedPagesLabelKey(summary: ImportedPagesSummary): TranslationKey {
  if (summary.families.length === 1) return IMPORT_FAMILY_FROM_KEY[summary.families[0]];
  return "from_imports";
}
