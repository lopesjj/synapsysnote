import { decodeText, fileExtension, isZipBytes, mimeFromName, readFileBytes } from "./binary";
import { parseDocx } from "./docx";
import { enexNotebookName, parseEnex } from "./enex";
import { looksLikeGoogleDocsExport, parseHtmlDocument } from "./html-import";
import { readZip, resolveZipPath, zipEntry, zipPaths, type ZipEntries } from "./zip";
import { ImportError, MAX_IMPORT_FILE_BYTES, type ImportedNote } from "./types";

export type ImportProvider = "evernote" | "word" | "google-docs";

export const PROVIDER_ACCEPT: Record<ImportProvider, string> = {
  evernote: ".enex,.zip",
  word: ".docx,.docm,.dotx",
  "google-docs": ".html,.htm,.docx,.zip",
};

export const PROVIDER_EXTENSIONS: Record<ImportProvider, string[]> = {
  evernote: ["enex", "zip"],
  word: ["docx", "docm", "dotx"],
  "google-docs": ["html", "htm", "xhtml", "docx", "zip"],
};

function baseName(path: string): string {
  return path.split("/").pop() || path;
}

function folderSegments(path: string): string[] {
  return path
    .split("/")
    .slice(0, -1)
    .map((segment) => segment.trim())
    .filter((segment) => segment && segment !== "." && segment !== "__MACOSX");
}

function fileContainerPath(file: File): string[] {
  const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
  if (!relative || !relative.includes("/")) return [];
  return folderSegments(relative).slice(1);
}

function isUsableEntry(path: string): boolean {
  if (path.endsWith("/")) return false;
  if (path.startsWith("__MACOSX/") || path.includes("/__MACOSX/")) return false;
  return !baseName(path).startsWith(".");
}

function parseZipArchive(bytes: Uint8Array, sourceFileName: string, provider?: ImportProvider): ImportedNote[] {
  const entries: ZipEntries = readZip(bytes);
  if (zipEntry(entries, "word/document.xml")) {
    return [parseDocx(bytes, sourceFileName, provider === "google-docs" ? "google-docs" : "docx")];
  }

  const notes: ImportedNote[] = [];

  for (const path of zipPaths(entries, (name) => isUsableEntry(name) && /\.enex$/i.test(name))) {
    const containerPath = [...folderSegments(path), enexNotebookName(baseName(path))].filter(Boolean);
    notes.push(
      ...parseEnex(decodeText(entries[path]), baseName(path), containerPath.length ? containerPath : undefined)
    );
  }

  for (const path of zipPaths(entries, (name) => isUsableEntry(name) && /\.(docx|docm|dotx)$/i.test(name))) {
    const note = parseDocx(entries[path], baseName(path), provider === "google-docs" ? "google-docs" : "docx");
    const containerPath = folderSegments(path);
    if (containerPath.length) note.containerPath = containerPath;
    notes.push(note);
  }

  for (const path of zipPaths(entries, (name) => isUsableEntry(name) && /\.x?html?$/i.test(name))) {
    const html = decodeText(entries[path]);
    const containerPath = folderSegments(path);
    const htmlNote = parseHtmlDocument(html, {
      sourceFileName: baseName(path),
      source: looksLikeGoogleDocsExport(html) || provider === "google-docs" ? "google-docs" : "html",
      resolveRelative: (relative) => {
        const data = zipEntry(entries, resolveZipPath(path, relative));
        if (!data) return null;
        const name = baseName(resolveZipPath(path, relative));
        return { bytes: data, name, mimeType: mimeFromName(name, "image/png") };
      },
    });
    if (containerPath.length) htmlNote.containerPath = containerPath;
    notes.push(htmlNote);
  }

  if (!notes.length) {
    throw new ImportError("unsupported_file", "O arquivo compactado nao contem notas reconhecidas.");
  }
  return notes;
}

export async function parseImportFile(file: File, provider?: ImportProvider): Promise<ImportedNote[]> {
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    throw new ImportError("file_too_large", "Arquivo acima do limite suportado.");
  }

  const bytes = await readFileBytes(file);
  if (!bytes.length) {
    throw new ImportError("empty_file", "Arquivo vazio.");
  }

  const extension = fileExtension(file.name);

  const droppedPath = fileContainerPath(file);

  if (extension === "enex") {
    const containerPath = [...droppedPath, enexNotebookName(file.name)].filter(Boolean);
    return parseEnex(decodeText(bytes), file.name, containerPath.length ? containerPath : undefined);
  }

  if (extension === "docx" || extension === "docm" || extension === "dotx") {
    const note = parseDocx(bytes, file.name, provider === "google-docs" ? "google-docs" : "docx");
    if (droppedPath.length) note.containerPath = droppedPath;
    return [note];
  }

  if (extension === "html" || extension === "htm" || extension === "xhtml") {
    const html = decodeText(bytes);
    return [
      parseHtmlDocument(html, {
        sourceFileName: file.name,
        source: looksLikeGoogleDocsExport(html) || provider === "google-docs" ? "google-docs" : "html",
      }),
    ];
  }

  if (extension === "zip" || isZipBytes(bytes)) {
    return parseZipArchive(bytes, file.name, provider);
  }

  const text = decodeText(bytes);
  if (/<en-export[\s>]/i.test(text) || /<en-note[\s>]/i.test(text)) {
    return parseEnex(text, file.name);
  }
  if (/<html[\s>]/i.test(text) || /<body[\s>]/i.test(text) || /<!doctype\s+html/i.test(text)) {
    return [
      parseHtmlDocument(text, {
        sourceFileName: file.name,
        source: looksLikeGoogleDocsExport(text) || provider === "google-docs" ? "google-docs" : "html",
      }),
    ];
  }

  throw new ImportError("unsupported_file", "Formato de arquivo nao suportado.");
}

export function isSupportedImportFile(file: File, provider?: ImportProvider): boolean {
  const extension = fileExtension(file.name);
  if (!provider) {
    return ["enex", "docx", "docm", "dotx", "html", "htm", "xhtml", "zip"].includes(extension);
  }
  return PROVIDER_EXTENSIONS[provider].includes(extension);
}
