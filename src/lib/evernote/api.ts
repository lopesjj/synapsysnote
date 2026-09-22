import "server-only";

import { ApiError } from "@/lib/api/errors";
import type { EvernoteMcpClient } from "./mcp";
import {
  collectRecords,
  detectContentType,
  extractContent,
  pickArgumentName,
  readString,
  readStringArray,
  readTimestamp,
} from "./payload";

export interface EvernoteNotebook {
  id: string;
  name: string;
  stack?: string | null;
}

export interface EvernoteNoteSummary {
  id: string;
  title: string;
  notebookId?: string | null;
  notebookName?: string | null;
  updatedAt?: string;
}

export interface EvernoteNoteContent {
  id: string;
  title: string;
  content: string;
  contentType: "enml" | "html" | "markdown" | "text";
  tags: string[];
}

const NOTEBOOK_TOOLS = ["search_notebooks", "list_notebooks", "find_notebooks", "get_notebooks"];
const NOTE_SEARCH_TOOLS = ["search_notes", "find_notes", "list_notes", "semantic_search"];
const NOTE_GET_TOOLS = ["get_note", "read_note", "fetch_note", "note_get"];

const QUERY_KEYS = ["query", "q", "search", "searchQuery", "search_query", "name", "filter", "text"];
const LIMIT_KEYS = ["limit", "maxResults", "max_results", "count", "pageSize", "page_size", "top"];
const NOTEBOOK_ID_KEYS = [
  "notebookGuid",
  "notebook_guid",
  "notebookId",
  "notebook_id",
  "notebook",
  "notebookName",
  "notebook_name",
];
const NOTE_ID_KEYS = ["noteGuid", "note_guid", "noteId", "note_id", "guid", "id"];

async function requireTool(client: EvernoteMcpClient, candidates: string[], label: string) {
  const tool = await client.findTool(candidates);
  if (!tool) {
    throw new ApiError(502, `O Evernote não expõe uma ferramenta de ${label}.`);
  }
  return tool;
}

export async function listEvernoteNotebooks(
  client: EvernoteMcpClient,
  query?: string
): Promise<EvernoteNotebook[]> {
  const tool = await requireTool(client, NOTEBOOK_TOOLS, "cadernos");
  const args: Record<string, unknown> = {};

  const queryKey = pickArgumentName(tool, QUERY_KEYS);
  if (queryKey) args[queryKey] = query ?? "";
  const limitKey = pickArgumentName(tool, LIMIT_KEYS);
  if (limitKey) args[limitKey] = 200;

  const payload = await client.callTool(tool.name, args);
  const records = collectRecords(payload);

  const notebooks: EvernoteNotebook[] = [];
  const seen = new Set<string>();
  for (const record of records) {
    const id = readString(record, ["guid", "notebookGuid", "notebook_guid", "id", "notebookId"]);
    const name = readString(record, ["name", "title", "notebookName", "label"]);
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    notebooks.push({
      id,
      name,
      stack: readString(record, ["stack", "stackName", "space", "spaceName"]),
    });
  }
  return notebooks;
}

export async function listEvernoteNotes(
  client: EvernoteMcpClient,
  input: { query?: string; notebookId?: string; notebookName?: string; limit?: number }
): Promise<EvernoteNoteSummary[]> {
  const tool = await requireTool(client, NOTE_SEARCH_TOOLS, "notas");
  const args: Record<string, unknown> = {};

  const notebookKey = pickArgumentName(tool, NOTEBOOK_ID_KEYS);
  const usesNotebookName = Boolean(notebookKey && /name/i.test(notebookKey));
  let grammar = input.query?.trim() ?? "";

  if (notebookKey && (input.notebookId || input.notebookName)) {
    args[notebookKey] = usesNotebookName
      ? (input.notebookName ?? input.notebookId)
      : (input.notebookId ?? input.notebookName);
  } else if (input.notebookName) {
    grammar = `notebook:"${input.notebookName}" ${grammar}`.trim();
  }

  const queryKey = pickArgumentName(tool, QUERY_KEYS);
  if (queryKey) args[queryKey] = grammar;
  const limitKey = pickArgumentName(tool, LIMIT_KEYS);
  if (limitKey) args[limitKey] = input.limit ?? 100;

  const payload = await client.callTool(tool.name, args);
  const records = collectRecords(payload);

  const notes: EvernoteNoteSummary[] = [];
  const seen = new Set<string>();
  for (const record of records) {
    const id = readString(record, ["guid", "noteGuid", "note_guid", "id", "noteId"]);
    const title = readString(record, ["title", "name", "subject"]);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    notes.push({
      id,
      title: title || "Sem título",
      notebookId: readString(record, ["notebookGuid", "notebook_guid", "notebookId"]),
      notebookName: readString(record, ["notebookName", "notebook_name", "notebook"]),
      updatedAt: readTimestamp(record, ["updated", "updatedAt", "updated_at", "modified", "created"]),
    });
  }
  return notes;
}

export async function getEvernoteNote(
  client: EvernoteMcpClient,
  noteId: string
): Promise<EvernoteNoteContent> {
  const tool = await requireTool(client, NOTE_GET_TOOLS, "conteúdo de nota");
  const args: Record<string, unknown> = {};

  const idKey = pickArgumentName(tool, NOTE_ID_KEYS) ?? "noteGuid";
  args[idKey] = noteId;

  const properties = tool.inputSchema?.properties ?? {};
  if ("includeContent" in properties) args.includeContent = true;
  if ("include_content" in properties) args.include_content = true;
  if ("format" in properties) {
    const options = properties.format?.enum;
    const preferred = ["enml", "html", "markdown"].find(
      (value) => !Array.isArray(options) || options.includes(value)
    );
    if (preferred) args.format = preferred;
  }

  const payload = await client.callTool(tool.name, args);
  const record = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const nested = (record.note ?? record.data ?? record) as Record<string, unknown>;

  const content = extractContent(payload);
  if (!content) {
    throw new ApiError(502, "O Evernote não devolveu o conteúdo da nota.");
  }

  return {
    id: noteId,
    title: readString(nested, ["title", "name", "subject"]) || "Sem título",
    content,
    contentType: detectContentType(content),
    tags: readStringArray(nested, ["tags", "tagNames", "tag_names", "labels"]),
  };
}
