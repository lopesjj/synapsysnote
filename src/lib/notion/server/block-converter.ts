import "server-only";

import { randomUUID } from "node:crypto";
import type { AppBlock, BlockMedia, BlockType, RichTextSpan } from "@/types/models";

/**
 * ETAPA 3.3 — Recursive Notion AST → app block format converter.
 *
 * Pure and side-effect free except for the two injected callbacks: fetching
 * children (paginated Notion API) and rehosting media (Cloud Storage). That
 * makes the mapping table unit-testable without touching the network.
 */

/* Loose structural types: the official SDK unions are exhaustive but unwieldy. */
interface NotionRichText {
  type: "text" | "mention" | "equation";
  plain_text: string;
  href: string | null;
  annotations: {
    bold: boolean;
    italic: boolean;
    strikethrough: boolean;
    underline: boolean;
    code: boolean;
    color: string;
  };
  equation?: { expression: string };
  mention?: {
    type: string;
    page?: { id: string };
    user?: { id: string; name?: string };
    date?: { start: string };
  };
}

interface NotionFile {
  type: "file" | "external";
  file?: { url: string; expiry_time?: string };
  external?: { url: string };
  name?: string;
  caption?: NotionRichText[];
}

export interface NotionBlock {
  id: string;
  type: string;
  has_children: boolean;
  [key: string]: unknown;
}

export interface ConvertContext {
  /** Paginated `GET /v1/blocks/{id}/children`. */
  fetchChildren: (blockId: string) => Promise<NotionBlock[]>;
  /**
   * Streams a Notion-hosted asset into Cloud Storage and returns permanent
   * metadata. Omitted when the caller disabled media download.
   */
  rehostMedia?: (input: {
    url: string;
    suggestedName: string;
    blockId: string;
  }) => Promise<BlockMedia>;
  /** Maps an already-imported Notion page id to its app page id (for links). */
  resolvePageLink?: (notionPageId: string) => string | undefined;
  /** Guard against pathological nesting / synced-block cycles. */
  maxDepth?: number;
}

const TYPE_MAP: Record<string, BlockType> = {
  paragraph: "paragraph",
  heading_1: "heading_1",
  heading_2: "heading_2",
  heading_3: "heading_3",
  bulleted_list_item: "bulleted_list_item",
  numbered_list_item: "numbered_list_item",
  to_do: "todo",
  toggle: "toggle",
  callout: "callout",
  quote: "quote",
  divider: "divider",
  code: "code",
  equation: "equation",
  image: "image",
  video: "video",
  audio: "audio",
  file: "file",
  pdf: "file",
  bookmark: "bookmark",
  embed: "embed",
  link_preview: "bookmark",
  table: "table",
  child_page: "child_page",
  child_database: "child_database",
};

/** Notion rich text → app rich text, preserving annotations, links and mentions. */
export function notionRichTextToSpans(
  richText: NotionRichText[] | undefined,
  ctx?: ConvertContext
): RichTextSpan[] {
  if (!richText?.length) return [];

  return richText.map((item) => {
    if (item.type === "equation" && item.equation) {
      return { text: `$${item.equation.expression}$`, annotations: { code: true } };
    }

    if (item.type === "mention" && item.mention) {
      const mention = item.mention;
      if (mention.type === "page" && mention.page) {
        const mapped = ctx?.resolvePageLink?.(mention.page.id);
        return {
          text: item.plain_text,
          mention: { kind: "page", pageId: mapped ?? mention.page.id, label: item.plain_text },
        };
      }
      if (mention.type === "user" && mention.user) {
        return {
          text: item.plain_text,
          mention: { kind: "user", userId: mention.user.id, label: item.plain_text },
        };
      }
      if (mention.type === "date" && mention.date) {
        return {
          text: item.plain_text,
          mention: { kind: "date", iso: mention.date.start, label: item.plain_text },
        };
      }
    }

    return {
      text: item.plain_text,
      href: item.href,
      annotations: {
        bold: item.annotations.bold || undefined,
        italic: item.annotations.italic || undefined,
        strikethrough: item.annotations.strikethrough || undefined,
        underline: item.annotations.underline || undefined,
        code: item.annotations.code || undefined,
        color: item.annotations.color !== "default" ? item.annotations.color : undefined,
      },
    };
  });
}

function fileUrl(file: NotionFile | undefined): string | null {
  if (!file) return null;
  return file.type === "external" ? (file.external?.url ?? null) : (file.file?.url ?? null);
}

function guessName(url: string, fallback: string): string {
  try {
    const pathname = new URL(url).pathname;
    const last = decodeURIComponent(pathname.split("/").pop() ?? "");
    return last || fallback;
  } catch {
    return fallback;
  }
}

/**
 * Converts a single Notion block (and, recursively, its children).
 * Returns `null` for blocks that carry no content in this app (e.g. breadcrumbs).
 */
export async function notionBlockToAppBlock(
  block: NotionBlock,
  ctx: ConvertContext,
  depth = 0
): Promise<AppBlock | null> {
  const maxDepth = ctx.maxDepth ?? 12;
  const payload = block[block.type] as Record<string, unknown> | undefined;
  const type = TYPE_MAP[block.type];

  // Structural containers are flattened: their children are hoisted by the caller.
  if (block.type === "column_list" || block.type === "column" || block.type === "synced_block") {
    const children =
      block.has_children && depth < maxDepth
        ? await notionBlocksToAppBlocks(await ctx.fetchChildren(block.id), ctx, depth + 1)
        : [];
    return children.length
      ? { id: randomUUID(), type: "paragraph", children, notionBlockId: block.id }
      : null;
  }

  if (block.type === "table_of_contents" || block.type === "breadcrumb") return null;

  if (block.type === "link_to_page") {
    const target = (payload?.page_id ?? payload?.database_id) as string | undefined;
    const mapped = target ? ctx.resolvePageLink?.(target) : undefined;
    return {
      id: randomUUID(),
      type: "paragraph",
      notionBlockId: block.id,
      richText: [
        {
          text: "Página vinculada",
          mention: { kind: "page", pageId: mapped ?? target ?? "", label: "Página vinculada" },
        },
      ],
    };
  }

  if (!type) {
    return {
      id: randomUUID(),
      type: "unsupported",
      notionBlockId: block.id,
      props: { title: block.type },
      richText: [{ text: `Bloco não suportado na origem: ${block.type}` }],
    };
  }

  const appBlock: AppBlock = { id: randomUUID(), type, notionBlockId: block.id };
  const richText = payload?.rich_text as NotionRichText[] | undefined;
  if (richText) appBlock.richText = notionRichTextToSpans(richText, ctx);

  switch (block.type) {
    case "to_do":
      appBlock.props = { checked: Boolean(payload?.checked) };
      break;

    case "callout": {
      const icon = payload?.icon as { type?: string; emoji?: string } | undefined;
      appBlock.props = { emoji: icon?.emoji ?? "💡", color: payload?.color as string };
      break;
    }

    case "code":
      appBlock.props = { language: (payload?.language as string) ?? "plaintext" };
      appBlock.richText = notionRichTextToSpans(richText, ctx);
      break;

    case "equation":
      appBlock.props = { expression: (payload?.expression as string) ?? "" };
      break;

    case "bookmark":
    case "embed":
    case "link_preview":
      appBlock.props = {
        url: (payload?.url as string) ?? "",
        title: notionRichTextToSpans(payload?.caption as NotionRichText[] | undefined)
          .map((span) => span.text)
          .join("") || (payload?.url as string),
      };
      break;

    case "child_page":
      appBlock.props = { title: (payload?.title as string) ?? "Página" };
      break;

    case "child_database":
      appBlock.props = { title: (payload?.title as string) ?? "Base de dados" };
      break;

    case "table":
      appBlock.props = {
        hasColumnHeader: Boolean(payload?.has_column_header),
        tableRows: [],
      };
      if (block.has_children) {
        const rows = await ctx.fetchChildren(block.id);
        appBlock.props.tableRows = rows
          .filter((row) => row.type === "table_row")
          .map((row) => {
            const cells = (row.table_row as { cells: NotionRichText[][] }).cells;
            return cells.map((cell) => notionRichTextToSpans(cell, ctx));
          });
      }
      return appBlock; // table children are consumed above

    case "image":
    case "video":
    case "audio":
    case "file":
    case "pdf": {
      const file = payload as unknown as NotionFile;
      const url = fileUrl(file);
      if (!url) break;
      const caption = notionRichTextToSpans(file.caption, ctx);
      const suggestedName = file.name ?? guessName(url, `${block.type}-${block.id}`);

      if (ctx.rehostMedia && file.type === "file") {
        // Notion's S3 URLs are presigned and expire in ~1h, so the asset must be
        // copied into our own bucket before the block is persisted.
        appBlock.media = {
          ...(await ctx.rehostMedia({ url, suggestedName, blockId: block.id })),
          caption,
        };
      } else {
        appBlock.media = { url, name: suggestedName, caption };
      }
      break;
    }

    default:
      break;
  }

  if (block.has_children && depth < maxDepth && block.type !== "table") {
    const children = await ctx.fetchChildren(block.id);
    const converted = await notionBlocksToAppBlocks(children, ctx, depth + 1);
    if (converted.length) appBlock.children = converted;
  }

  return appBlock;
}

export async function notionBlocksToAppBlocks(
  blocks: NotionBlock[],
  ctx: ConvertContext,
  depth = 0
): Promise<AppBlock[]> {
  const out: AppBlock[] = [];
  for (const block of blocks) {
    const converted = await notionBlockToAppBlock(block, ctx, depth);
    if (!converted) continue;
    // Flattened containers contribute their children directly.
    if (
      converted.type === "paragraph" &&
      !converted.richText?.length &&
      converted.children?.length &&
      ["column_list", "column", "synced_block"].includes(String(blocks.find((b) => b.id === converted.notionBlockId)?.type))
    ) {
      out.push(...converted.children);
      continue;
    }
    out.push(converted);
  }
  return out;
}

/** Flattens converted blocks into the searchable text stored on the page. */
export function blocksToPlainText(blocks: AppBlock[]): string {
  const parts: string[] = [];
  const walk = (list: AppBlock[]) => {
    for (const block of list) {
      if (block.richText?.length) parts.push(block.richText.map((s) => s.text).join(""));
      if (typeof block.props?.title === "string") parts.push(block.props.title);
      if (typeof block.props?.expression === "string") parts.push(block.props.expression);
      if (block.media?.name) parts.push(block.media.name);
      if (block.children?.length) walk(block.children);
    }
  };
  walk(blocks);
  return parts.filter(Boolean).join("\n");
}

/** Counts how many assets a page will push through the media pipeline. */
export function countMediaBlocks(blocks: NotionBlock[]): number {
  return blocks.filter((block) =>
    ["image", "video", "audio", "file", "pdf"].includes(block.type)
  ).length;
}
