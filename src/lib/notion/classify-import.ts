import type { AppBlock } from "@/types/models";

/**
 * Decides whether a Notion item should become a notebook (página/caderno) or
 * a note (nota), given children and body content.
 *
 * A container with children and no real body is a notebook: root → página,
 * nested → caderno. A leaf, or anything with real writing, is a nota.
 * Notion databases / CSV exports always stay as notes (or AppDatabase).
 */

const APP_STRUCTURAL = new Set(["child_page", "child_database", "divider"]);

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
  blocks?: AppBlock[];
  notionBlocks?: ReadonlyArray<{ type: string; [key: string]: unknown }>;
  /** CSV / Notion database — never a notebook. */
  forcePage?: boolean;
}): boolean {
  if (input.forcePage) return false;
  if (input.childCount <= 0) return false;
  if (input.notionBlocks) return !hasSubstantiveNotionBlocks(input.notionBlocks);
  return !hasSubstantiveContent(input.blocks ?? []);
}

export function hasSubstantiveContent(blocks: AppBlock[]): boolean {
  const signals: { text: string; media: boolean }[] = [];
  const walk = (list: AppBlock[]) => {
    for (const block of list) {
      if (APP_STRUCTURAL.has(block.type) || isChildDocumentLink(block)) {
        if (block.children?.length) walk(block.children);
        continue;
      }
      const text = appBlockText(block);
      const media = Boolean(block.media?.url) || Boolean(block.props?.tableRows?.length);
      if (text || media) signals.push({ text, media });
      if (block.children?.length) walk(block.children);
    }
  };
  walk(blocks);
  return evaluateSignals(signals);
}

export function hasSubstantiveNotionBlocks(
  blocks: ReadonlyArray<{ type: string; [key: string]: unknown }>
): boolean {
  const signals: { text: string; media: boolean }[] = [];
  for (const block of blocks) {
    if (NOTION_STRUCTURAL.has(block.type)) continue;
    const payload =
      typeof block[block.type] === "object" && block[block.type]
        ? (block[block.type] as {
            rich_text?: { plain_text?: string }[];
            url?: string;
          })
        : {};
    const text = (payload.rich_text ?? []).map((span) => span.plain_text ?? "").join("").trim();
    const media = NOTION_MEDIA.has(block.type);
    if (!text && !media) continue;
    signals.push({ text, media });
  }
  return evaluateSignals(signals);
}

export function countChildPageBlocks(
  blocks: ReadonlyArray<{ type: string }> | AppBlock[]
): number {
  let count = 0;
  const walk = (list: ReadonlyArray<{ type: string; children?: AppBlock[] }>) => {
    for (const block of list) {
      if (block.type === "child_page" || block.type === "child_database") count += 1;
      if (block.children?.length) walk(block.children);
    }
  };
  walk(blocks as AppBlock[]);
  return count;
}

/**
 * Walks Notion parents and returns the nearest imported notebook and note.
 * Used so a nota lands in its caderno/página and only nests under another nota.
 */
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

function evaluateSignals(signals: { text: string; media: boolean }[]): boolean {
  if (!signals.length) return false;
  if (signals.some((signal) => signal.media)) return true;
  if (signals.length >= 2) return true;
  return signals[0].text.length > 40;
}

function appBlockText(block: AppBlock): string {
  const spans = (block.richText ?? []).map((span) => span.text).join("");
  const extra =
    typeof block.props?.expression === "string"
      ? block.props.expression
      : typeof block.props?.title === "string" && block.type !== "child_page"
        ? block.props.title
        : "";
  return `${spans} ${extra}`.trim();
}

/**
 * Notion's Markdown export turns child pages into a list of relative `.md`
 * links. Those are the zip equivalent of `child_page` blocks — not body copy.
 */
function isChildDocumentLink(block: AppBlock): boolean {
  if (block.type !== "paragraph" && block.type !== "bulleted_list_item") return false;
  const spans = block.richText ?? [];
  if (!spans.length) return false;
  const hrefs = spans.filter((span) => span.href);
  if (!hrefs.length) return false;
  const text = spans.map((span) => span.text).join("").trim();
  const linkText = hrefs.map((span) => span.text).join("").trim();
  if (text !== linkText) return false;
  return hrefs.every((span) => {
    const href = span.href ?? "";
    return /\.md($|[?#])/i.test(href) || /[0-9a-f]{32}/i.test(href);
  });
}
