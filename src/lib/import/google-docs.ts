import { parseHtmlDocument } from "./html-import";
import { ImportError, type ImportedNote, type ImportErrorCode } from "./types";

const SERVER_ERROR_CODES = new Set<ImportErrorCode>([
  "invalid_google_doc_url",
  "google_doc_not_public",
  "file_too_large",
]);

export function extractGoogleDocId(input: string): string | null {
  const value = input.trim();
  if (!value) return null;

  const published = /\/document\/(?:u\/\d+\/)?d\/e\/([A-Za-z0-9_-]{20,})/.exec(value);
  if (published) return published[1];

  const standard = /\/document\/(?:u\/\d+\/)?d\/([A-Za-z0-9_-]{20,})/.exec(value);
  if (standard) return standard[1];

  if (/^[A-Za-z0-9_-]{20,}$/.test(value)) return value;

  try {
    const url = new URL(value);
    const id = url.searchParams.get("id");
    if (id && /^[A-Za-z0-9_-]{20,}$/.test(id)) return id;
  } catch {
    return null;
  }
  return null;
}

export function isGoogleDocsUrl(input: string): boolean {
  return extractGoogleDocId(input) !== null;
}

export async function importGoogleDocFromUrl(url: string): Promise<ImportedNote> {
  if (!extractGoogleDocId(url)) {
    throw new ImportError("invalid_google_doc_url", "Link do Google Docs invalido.");
  }

  let response: Response;
  try {
    response = await fetch("/api/import/google-doc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
  } catch {
    throw new ImportError("google_doc_unavailable", "Nao foi possivel acessar o Google Docs.");
  }

  const payload = (await response.json().catch(() => ({}))) as { html?: string; code?: string };

  if (!response.ok || !payload.html) {
    const reported = payload.code as ImportErrorCode | undefined;
    const code: ImportErrorCode =
      reported && SERVER_ERROR_CODES.has(reported) ? reported : "google_doc_unavailable";
    throw new ImportError(code, code);
  }

  return parseHtmlDocument(payload.html, {
    sourceFileName: "Google Docs",
    source: "google-docs",
  });
}
