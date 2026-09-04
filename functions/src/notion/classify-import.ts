/**
 * Mirrors `src/lib/notion/classify-import.ts` for the Cloud Functions worker.
 * Keep the heuristics in sync: empty containers → notebook, content/leaf → note.
 */

const NOTION_STRUCTURAL = new Set([
  "child_page",
  "child_database",
  "divider",
  "table_of_contents",
  "breadcrumb",
  "column_list",
  "column",
]);

const NOTION_MEDIA = new Set([
  "image",
  "video",
  "audio",
  "file",
  "pdf",
  "code",
  "equation",
  "table",
  "bookmark",
  "embed",
  "link_preview",
]);

export type ImportRole = "notebook" | "page" | "database";

export function shouldImportAsNotebook(input: {
  childCount: number;
  notionBlocks: ReadonlyArray<{ type: string; [key: string]: unknown }>;
}): boolean {
  if (input.childCount <= 0) return false;
  return !hasSubstantiveNotionBlocks(input.notionBlocks);
}

export function hasSubstantiveNotionBlocks(
  blocks: ReadonlyArray<{ type: string; [key: string]: unknown }>
): boolean {
  const signals: { text: string; media: boolean }[] = [];
  for (const block of blocks) {
    if (NOTION_STRUCTURAL.has(block.type)) continue;
    const payload =
      typeof block[block.type] === "object" && block[block.type]
        ? (block[block.type] as { rich_text?: { plain_text?: string }[] })
        : {};
    const text = (payload.rich_text ?? []).map((span) => span.plain_text ?? "").join("").trim();
    const media = NOTION_MEDIA.has(block.type);
    if (!text && !media) continue;
    signals.push({ text, media });
  }
  if (!signals.length) return false;
  if (signals.some((signal) => signal.media)) return true;
  if (signals.length >= 2) return true;
  return signals[0].text.length > 40;
}

export function countChildPageBlocks(blocks: ReadonlyArray<{ type: string }>): number {
  return blocks.filter((block) => block.type === "child_page" || block.type === "child_database")
    .length;
}

export function resolveImportPlacement(input: {
  notionId: string;
  parents: Map<string, string | null>;
  roles: Map<string, ImportRole>;
  idMap: Map<string, string>;
  fallbackNotebookId: string | null;
  preserveHierarchy: boolean;
}): { notebookId: string | null; parentPageId: string | null } {
  if (!input.preserveHierarchy) {
    return { notebookId: input.fallbackNotebookId, parentPageId: null };
  }

  let notebookId: string | null = null;
  let parentPageId: string | null = null;
  let cursor = input.parents.get(input.notionId) ?? null;

  while (cursor) {
    const role = input.roles.get(cursor);
    const appId = input.idMap.get(cursor);
    if (role === "notebook" && appId && !notebookId) notebookId = appId;
    if (role === "page" && appId && !parentPageId) parentPageId = appId;
    cursor = input.parents.get(cursor) ?? null;
  }

  return { notebookId: notebookId ?? input.fallbackNotebookId, parentPageId };
}

export function resolveNotebookParentId(input: {
  notionId: string;
  parents: Map<string, string | null>;
  roles: Map<string, ImportRole>;
  idMap: Map<string, string>;
}): string | null {
  let cursor = input.parents.get(input.notionId) ?? null;
  while (cursor) {
    if (input.roles.get(cursor) === "notebook") return input.idMap.get(cursor) ?? null;
    cursor = input.parents.get(cursor) ?? null;
  }
  return null;
}
