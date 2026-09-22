export interface McpToolDefinition {
  name: string;
  description?: string;
  inputSchema?: {
    properties?: Record<string, { type?: string; description?: string; enum?: unknown[] }>;
    required?: string[];
  };
}

export type EvernoteContentType = "enml" | "html" | "markdown" | "text";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function pickArgumentName(
  tool: McpToolDefinition | null,
  candidates: string[]
): string | null {
  const properties = tool?.inputSchema?.properties;
  if (!properties) return candidates[0] ?? null;
  for (const candidate of candidates) {
    if (candidate in properties) return candidate;
  }
  const normalized = Object.keys(properties).map((key) => ({
    key,
    flat: key.replace(/[-_]/g, "").toLowerCase(),
  }));
  for (const candidate of candidates) {
    const flat = candidate.replace(/[-_]/g, "").toLowerCase();
    const hit = normalized.find((entry) => entry.flat === flat);
    if (hit) return hit.key;
  }
  return null;
}

export function readString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  const lowered = new Map(
    Object.entries(record).map(([key, value]) => [key.replace(/[-_]/g, "").toLowerCase(), value])
  );
  for (const key of keys) {
    const value = lowered.get(key.replace(/[-_]/g, "").toLowerCase());
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}

export function collectRecords(payload: unknown, depth = 0): Record<string, unknown>[] {
  if (depth > 4 || payload === null || payload === undefined) return [];
  if (Array.isArray(payload)) {
    return payload.filter((item): item is Record<string, unknown> => isPlainObject(item));
  }
  if (!isPlainObject(payload)) return [];

  const preferredKeys = [
    "notebooks",
    "notes",
    "results",
    "items",
    "data",
    "records",
    "matches",
    "content",
    "entries",
    "list",
  ];
  for (const key of preferredKeys) {
    const found = collectRecords(payload[key], depth + 1);
    if (found.length) return found;
  }

  for (const value of Object.values(payload)) {
    if (Array.isArray(value)) {
      const found = collectRecords(value, depth + 1);
      if (found.length) return found;
    }
  }

  if (readString(payload, ["guid", "id", "noteGuid", "notebookGuid"])) {
    return [payload];
  }
  return [];
}

export function readTimestamp(record: Record<string, unknown>, keys: string[]): string | undefined {
  const raw = readString(record, keys);
  if (!raw) return undefined;
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 1_000_000_000) {
    const ms = numeric > 1_000_000_000_000 ? numeric : numeric * 1000;
    return new Date(ms).toISOString();
  }
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
}

export function readStringArray(record: Record<string, unknown>, keys: string[]): string[] {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value
        .map((item) =>
          typeof item === "string"
            ? item
            : isPlainObject(item)
              ? (readString(item, ["name", "title", "label"]) ?? "")
              : ""
        )
        .filter(Boolean);
    }
  }
  return [];
}

export function detectContentType(raw: string): EvernoteContentType {
  if (/<en-note[\s>]/i.test(raw) || /<!DOCTYPE\s+en-note/i.test(raw)) return "enml";
  if (/<(p|div|h[1-6]|ul|ol|li|table|br|span|img)[\s/>]/i.test(raw)) return "html";
  if (/^\s{0,3}(#{1,6}\s|[-*+]\s|\d+\.\s|>\s)/m.test(raw) || /\*\*[^*]+\*\*/.test(raw)) {
    return "markdown";
  }
  return "text";
}

export function extractContent(payload: unknown, depth = 0): string {
  if (typeof payload === "string") return payload;
  if (depth > 3 || !isPlainObject(payload)) return "";

  const direct = readString(payload, [
    "enml",
    "content",
    "body",
    "html",
    "markdown",
    "text",
    "noteContent",
    "contentHtml",
  ]);
  if (direct) return direct;

  for (const key of ["note", "data", "result"]) {
    const nested = payload[key];
    if (nested) {
      const found = extractContent(nested, depth + 1);
      if (found) return found;
    }
  }
  return "";
}
