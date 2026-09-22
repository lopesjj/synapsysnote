import { unzipSync } from "fflate";
import { decodeText } from "./binary";
import { ImportError } from "./types";

export type ZipEntries = Record<string, Uint8Array>;

export function readZip(bytes: Uint8Array): ZipEntries {
  try {
    return unzipSync(bytes) as ZipEntries;
  } catch {
    throw new ImportError("corrupted_file", "Não foi possível ler o arquivo compactado.");
  }
}

export function zipEntry(entries: ZipEntries, path: string): Uint8Array | null {
  const direct = entries[path];
  if (direct) return direct;
  const lower = path.toLowerCase();
  for (const [key, value] of Object.entries(entries)) {
    if (key.toLowerCase() === lower) return value;
  }
  return null;
}

export function zipText(entries: ZipEntries, path: string): string | null {
  const bytes = zipEntry(entries, path);
  return bytes ? decodeText(bytes) : null;
}

export function zipPaths(entries: ZipEntries, predicate: (path: string) => boolean): string[] {
  return Object.keys(entries)
    .filter((path) => !path.endsWith("/"))
    .filter(predicate)
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
}

export function resolveZipPath(base: string, relative: string): string {
  if (!relative) return base;
  if (relative.startsWith("/")) return relative.slice(1);
  const baseParts = base.split("/").slice(0, -1);
  for (const part of relative.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      baseParts.pop();
      continue;
    }
    baseParts.push(part);
  }
  return baseParts.join("/");
}
