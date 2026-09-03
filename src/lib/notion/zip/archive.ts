import type JSZip from "jszip";
import type { ZipEntry } from "./types";

/**
 * Reads the shape of a Notion "Markdown & CSV" export.
 *
 * The export nests folders exactly like the workspace it came from:
 *
 *   Export-<uuid>/
 *     Projetos <32-hex>.md            ← a page
 *     Projetos <32-hex>/              ← that page's children
 *       Reunião <32-hex>.md
 *       diagrama.png                  ← media referenced by the .md above
 *     Tarefas <32-hex>.csv            ← a database view
 *     Tarefas <32-hex>/               ← one .md per database row
 *
 * Two details drive the whole mapping. First, every exported name carries a
 * 32-character hex id, which is the only reliable join key between a page, its
 * child folder and the relative links pointing at it — titles repeat, ids do
 * not. Second, the top wrapper folder (and, for single-page exports, nothing at
 * all) is not part of the user's hierarchy and has to be stripped before the
 * first real level is read as notebooks.
 */

/** `Nome da página abc123…def.md` → the trailing 32-hex id. */
const NOTION_ID = /\s*\b([0-9a-f]{32})\b/i;

export function stripNotionId(name: string): { title: string; notionId: string | null } {
  const withoutExtension = name.replace(/\.(md|csv|txt)$/i, "");
  const match = NOTION_ID.exec(withoutExtension);
  if (!match) return { title: withoutExtension.trim(), notionId: null };
  return {
    title: withoutExtension.replace(match[0], "").trim() || "Sem título",
    notionId: match[1].toLowerCase(),
  };
}

export function isMarkdown(path: string): boolean {
  return /\.md$/i.test(path);
}

export function isCsv(path: string): boolean {
  // Notion also emits `<name>_all.csv` duplicates of every view; the base file
  // is enough and importing both would double every database.
  return /\.csv$/i.test(path) && !/_all\.csv$/i.test(path);
}

export function isMedia(path: string): boolean {
  return /\.(png|jpe?g|gif|webp|svg|avif|bmp|ico|mp4|webm|mov|mp3|wav|m4a|ogg|pdf)$/i.test(path);
}

const MIME_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  avif: "image/avif",
  bmp: "image/bmp",
  ico: "image/x-icon",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  ogg: "audio/ogg",
  pdf: "application/pdf",
};

export function mimeTypeOf(path: string): string {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  return MIME_TYPES[extension] ?? "application/octet-stream";
}

export function isImage(path: string): boolean {
  return mimeTypeOf(path).startsWith("image/");
}

/**
 * Number of leading path segments shared by every entry — the wrapper folder
 * Notion adds around an export, which must not become a notebook.
 */
export function commonPrefixDepth(paths: string[]): number {
  if (paths.length === 0) return 0;

  const split = paths.map((path) => path.split("/").filter(Boolean));
  const shortest = Math.min(...split.map((parts) => parts.length));
  let depth = 0;

  // Stop one short of the shortest path so a file never loses its own name.
  while (depth < shortest - 1) {
    const segment = split[0][depth];
    if (!split.every((parts) => parts[depth] === segment)) break;
    depth += 1;
  }
  return depth;
}

/** Flattens the archive into the entries the importer cares about. */
export async function readArchive(zip: JSZip): Promise<ZipEntry[]> {
  const files = Object.values(zip.files).filter(
    (file) =>
      !file.dir &&
      // Editor and OS cruft that would otherwise turn into empty notes.
      !file.name.split("/").some((segment) => segment.startsWith(".") || segment === "__MACOSX")
  );

  const depth = commonPrefixDepth(files.map((file) => file.name));

  return files.map((file) => {
    const segments = file.name.split("/").filter(Boolean).slice(depth);
    return {
      path: file.name,
      /** Path relative to the export root, i.e. what the hierarchy is built from. */
      relativePath: segments.join("/"),
      segments,
      file,
    };
  });
}
