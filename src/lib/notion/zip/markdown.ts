import { nanoid } from "nanoid";
import type { AppBlock, BlockType, RichTextSpan } from "@/types/models";

/**
 * Notion Markdown → `AppBlock[]`.
 *
 * Notion's "Markdown & CSV" export is CommonMark with a handful of Notion-only
 * habits: the first `# ` line repeats the page title, callouts come through as
 * `<aside>` elements, equations as `$$…$$` fences, and toggles as
 * `<details><summary>`. This converter targets exactly that dialect rather than
 * being a general Markdown implementation — anything it does not recognise
 * degrades to a paragraph, never to a thrown error, because a single odd line
 * must not fail an import of thousands of pages.
 *
 * Images keep their raw (relative) URL here; `run-import.ts` rewrites them to
 * Storage download URLs once the archive's media has been uploaded.
 */

function blockId(): string {
  return `blk_${nanoid(8)}`;
}

function block(type: BlockType, richText?: RichTextSpan[], extra?: Partial<AppBlock>): AppBlock {
  return { id: blockId(), type, ...(richText ? { richText } : {}), ...extra };
}

/* -------------------------------------------------------------------------- */
/* Inline formatting                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Ordered by precedence. Code is first so `` `**x**` `` stays literal, and
 * links are parsed before emphasis so a bold link keeps its href.
 */
const INLINE_RULES: {
  pattern: RegExp;
  apply: (match: RegExpExecArray) => RichTextSpan[];
}[] = [
  {
    pattern: /`([^`]+)`/,
    apply: (match) => [{ text: match[1], annotations: { code: true } }],
  },
  {
    // Images are handled at block level; an inline one degrades to its alt text.
    pattern: /!\[([^\]]*)\]\(([^)]+)\)/,
    apply: (match) => [{ text: match[1] || match[2] }],
  },
  {
    pattern: /\[([^\]]*)\]\(([^)]+)\)/,
    apply: (match) => {
      const href = decodeHref(match[2]);
      return parseInline(match[1] || href).map((span) => ({ ...span, href }));
    },
  },
  {
    pattern: /\*\*\*([^*]+)\*\*\*/,
    apply: (match) => annotate(match[1], { bold: true, italic: true }),
  },
  {
    pattern: /\*\*([^*]+)\*\*/,
    apply: (match) => annotate(match[1], { bold: true }),
  },
  {
    pattern: /~~([^~]+)~~/,
    apply: (match) => annotate(match[1], { strikethrough: true }),
  },
  {
    pattern: /(?<![\w*])\*([^*\n]+)\*(?![\w*])/,
    apply: (match) => annotate(match[1], { italic: true }),
  },
  {
    pattern: /(?<![\w_])_([^_\n]+)_(?![\w_])/,
    apply: (match) => annotate(match[1], { italic: true }),
  },
];

function annotate(
  text: string,
  annotations: NonNullable<RichTextSpan["annotations"]>
): RichTextSpan[] {
  return parseInline(text).map((span) => ({
    ...span,
    annotations: { ...span.annotations, ...annotations },
  }));
}

/** Notion percent-encodes spaces in local links; keep external URLs intact. */
function decodeHref(href: string): string {
  const trimmed = href.trim().replace(/^<|>$/g, "");
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("#")) return trimmed;
  try {
    return decodeURIComponent(trimmed);
  } catch {
    return trimmed;
  }
}

/** Splits a line into styled spans, recursing into each matched construct. */
export function parseInline(text: string): RichTextSpan[] {
  if (!text) return [];

  let earliest: { index: number; length: number; spans: RichTextSpan[] } | null = null;
  for (const rule of INLINE_RULES) {
    const match = rule.pattern.exec(text);
    if (!match) continue;
    if (!earliest || match.index < earliest.index) {
      earliest = { index: match.index, length: match[0].length, spans: rule.apply(match) };
    }
  }

  if (!earliest) return [{ text: unescapeMarkdown(text) }];

  const before = text.slice(0, earliest.index);
  const after = text.slice(earliest.index + earliest.length);
  return [
    ...(before ? [{ text: unescapeMarkdown(before) }] : []),
    ...earliest.spans,
    ...parseInline(after),
  ];
}

function unescapeMarkdown(text: string): string {
  return text.replace(/\\([\\`*_{}[\]()#+\-.!>~|])/g, "$1");
}

/* -------------------------------------------------------------------------- */
/* Block structure                                                             */
/* -------------------------------------------------------------------------- */

const HEADING_TYPES: Record<number, BlockType> = {
  1: "heading_1",
  2: "heading_2",
  3: "heading_3",
};

export interface ParsedMarkdown {
  /** Title from the leading `# ` line, when present. */
  title: string | null;
  blocks: AppBlock[];
  /** Relative media paths referenced by image blocks, for the uploader. */
  mediaPaths: string[];
  /** Relative document links, for rewriting into page mentions. */
  documentLinks: string[];
}

export function parseNotionMarkdown(source: string): ParsedMarkdown {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: AppBlock[] = [];
  const mediaPaths = new Set<string>();
  const documentLinks = new Set<string>();

  let title: string | null = null;
  let index = 0;

  // Notion repeats the page title as the first H1; the app renders the title
  // separately, so consuming it here avoids a duplicate heading.
  while (index < lines.length && !lines[index].trim()) index += 1;
  if (index < lines.length) {
    const heading = /^#\s+(.*)$/.exec(lines[index]);
    if (heading) {
      title = heading[1].trim();
      index += 1;
    }
  }

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    /* Fenced code -------------------------------------------------------- */
    const fence = /^```(\S*)\s*$/.exec(trimmed);
    if (fence) {
      const language = fence[1] || "plaintext";
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/.test(lines[index].trim())) {
        body.push(lines[index]);
        index += 1;
      }
      index += 1; // closing fence
      blocks.push(
        block("code", [{ text: body.join("\n") }], { props: { language } })
      );
      continue;
    }

    /* Equation ----------------------------------------------------------- */
    if (trimmed === "$$") {
      const body: string[] = [];
      index += 1;
      while (index < lines.length && lines[index].trim() !== "$$") {
        body.push(lines[index]);
        index += 1;
      }
      index += 1;
      blocks.push(block("equation", undefined, { props: { expression: body.join("\n").trim() } }));
      continue;
    }
    const inlineEquation = /^\$\$(.+)\$\$$/.exec(trimmed);
    if (inlineEquation) {
      blocks.push(block("equation", undefined, { props: { expression: inlineEquation[1].trim() } }));
      index += 1;
      continue;
    }

    /* Divider ------------------------------------------------------------ */
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push(block("divider"));
      index += 1;
      continue;
    }

    /* Heading ------------------------------------------------------------ */
    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      const level = Math.min(heading[1].length, 3);
      blocks.push(block(HEADING_TYPES[level], parseInline(heading[2].trim())));
      index += 1;
      continue;
    }

    /* Callout (Notion exports these as <aside>) --------------------------- */
    if (/^<aside>/i.test(trimmed)) {
      const body: string[] = [trimmed.replace(/^<aside>/i, "")];
      let closed = /<\/aside>/i.test(trimmed);
      index += 1;
      while (index < lines.length && !closed) {
        closed = /<\/aside>/i.test(lines[index]);
        body.push(lines[index].replace(/<\/aside>/i, ""));
        index += 1;
      }
      const inner = body.join("\n").trim();
      // A leading emoji is Notion's callout icon.
      const emojiMatch = /^(\p{Extended_Pictographic}\uFE0F?)\s*/u.exec(inner);
      const emoji = emojiMatch?.[1] ?? "💡";
      const nested = parseNotionMarkdown(
        emojiMatch ? inner.slice(emojiMatch[0].length) : inner
      );
      nested.mediaPaths.forEach((path) => mediaPaths.add(path));
      nested.documentLinks.forEach((link) => documentLinks.add(link));
      blocks.push(
        block("callout", undefined, {
          props: { emoji },
          children: nested.blocks.length ? nested.blocks : [block("paragraph", [{ text: "" }])],
        })
      );
      continue;
    }

    /* Toggle (<details><summary>) ---------------------------------------- */
    if (/^<details>/i.test(trimmed)) {
      const body: string[] = [];
      let summary = "";
      index += 1;
      while (index < lines.length && !/^<\/details>/i.test(lines[index].trim())) {
        const summaryMatch = /<summary>(.*?)<\/summary>/i.exec(lines[index]);
        if (summaryMatch) summary = summaryMatch[1];
        else body.push(lines[index]);
        index += 1;
      }
      index += 1;
      const nested = parseNotionMarkdown(body.join("\n"));
      nested.mediaPaths.forEach((path) => mediaPaths.add(path));
      nested.documentLinks.forEach((link) => documentLinks.add(link));
      blocks.push(
        block("toggle", parseInline(summary.trim()), {
          children: nested.blocks,
        })
      );
      continue;
    }

    /* Standalone image --------------------------------------------------- */
    const image = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(trimmed);
    if (image) {
      const url = decodeHref(image[2]);
      if (!/^https?:\/\//i.test(url)) mediaPaths.add(url);
      blocks.push(
        block("image", undefined, {
          media: { url, name: image[1] || undefined, pending: true },
        })
      );
      index += 1;
      continue;
    }

    /* Blockquote --------------------------------------------------------- */
    if (/^>\s?/.test(trimmed)) {
      const body: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index].trim())) {
        body.push(lines[index].trim().replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push(block("quote", parseInline(body.join(" ").trim())));
      continue;
    }

    /* Table -------------------------------------------------------------- */
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      const rows: string[] = [];
      while (index < lines.length) {
        const candidate = lines[index].trim();
        if (!candidate.startsWith("|")) break;
        rows.push(candidate);
        index += 1;
      }
      const cells = rows
        // The `|---|---|` alignment row carries no data.
        .filter((row) => !/^\|[\s:|-]+\|$/.test(row))
        .map((row) =>
          row
            .slice(1, -1)
            .split("|")
            .map((cell) => parseInline(cell.trim()))
        );
      if (cells.length) {
        blocks.push(
          block("table", undefined, {
            props: { tableRows: cells, hasColumnHeader: rows.length > cells.length },
          })
        );
      }
      continue;
    }

    /* Lists -------------------------------------------------------------- */
    const listItem = matchListItem(trimmed);
    if (listItem) {
      const { consumed, items } = collectList(lines, index);
      index = consumed;
      for (const item of items) {
        const nested = parseNotionMarkdown(item.text);
        nested.mediaPaths.forEach((path) => mediaPaths.add(path));
        nested.documentLinks.forEach((link) => documentLinks.add(link));
        blocks.push(
          block(item.type, parseInline(item.label), {
            ...(item.type === "todo" ? { props: { checked: item.checked } } : {}),
            ...(nested.blocks.length ? { children: nested.blocks } : {}),
          })
        );
      }
      continue;
    }

    /* Paragraph ---------------------------------------------------------- */
    const paragraph: string[] = [];
    while (index < lines.length) {
      const candidate = lines[index];
      if (!candidate.trim() || isBlockStart(candidate.trim())) break;
      paragraph.push(candidate.trim());
      index += 1;
    }
    blocks.push(block("paragraph", parseInline(paragraph.join(" "))));
  }

  // Collect links after the fact so every construct contributes.
  for (const found of source.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const href = decodeHref(found[1]);
    if (/^https?:\/\//i.test(href) || href.startsWith("#")) continue;
    if (/\.(png|jpe?g|gif|webp|svg|avif)$/i.test(href)) mediaPaths.add(href);
    else documentLinks.add(href);
  }

  return {
    title,
    blocks: blocks.length ? blocks : [block("paragraph", [{ text: "" }])],
    mediaPaths: [...mediaPaths],
    documentLinks: [...documentLinks],
  };
}

interface ListItemMatch {
  type: BlockType;
  label: string;
  checked: boolean;
  indent: number;
}

function matchListItem(line: string): Omit<ListItemMatch, "indent"> | null {
  const todo = /^[-*+]\s+\[([ xX])\]\s+(.*)$/.exec(line);
  if (todo) {
    return { type: "todo", label: todo[2], checked: todo[1].toLowerCase() === "x" };
  }
  const bullet = /^[-*+]\s+(.*)$/.exec(line);
  if (bullet) return { type: "bulleted_list_item", label: bullet[1], checked: false };
  const ordered = /^\d+[.)]\s+(.*)$/.exec(line);
  if (ordered) return { type: "numbered_list_item", label: ordered[1], checked: false };
  return null;
}

/**
 * Reads a run of list items, folding indented continuation lines into each
 * item's nested source so sub-lists survive as children.
 */
function collectList(
  lines: string[],
  start: number
): { consumed: number; items: (Omit<ListItemMatch, "indent"> & { text: string })[] } {
  const items: (Omit<ListItemMatch, "indent"> & { text: string })[] = [];
  let index = start;
  const baseIndent = indentOf(lines[start]);

  while (index < lines.length) {
    const raw = lines[index];
    if (!raw.trim()) {
      // A blank line ends the list unless an indented item follows.
      const next = lines[index + 1];
      if (!next || indentOf(next) <= baseIndent) break;
      index += 1;
      continue;
    }

    const indent = indentOf(raw);
    if (indent < baseIndent) break;

    const match = matchListItem(raw.trim());
    if (indent === baseIndent && match) {
      items.push({ ...match, text: "" });
      index += 1;
      continue;
    }
    if (!items.length) break;

    // Deeper indentation (or a lazy continuation) belongs to the current item.
    items[items.length - 1].text += `${raw.slice(Math.min(indent, baseIndent + 2))}\n`;
    index += 1;
  }

  return { consumed: index, items };
}

function indentOf(line: string): number {
  return /^\s*/.exec(line)?.[0].replace(/\t/g, "  ").length ?? 0;
}

function isBlockStart(line: string): boolean {
  return (
    /^#{1,6}\s/.test(line) ||
    /^```/.test(line) ||
    /^>\s?/.test(line) ||
    /^(-{3,}|\*{3,}|_{3,})$/.test(line) ||
    /^<(aside|details)>/i.test(line) ||
    line === "$$" ||
    line.startsWith("|") ||
    matchListItem(line) !== null
  );
}
