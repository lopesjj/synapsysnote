import { nanoid } from "nanoid";
import type { AppBlock, BlockType, RichTextSpan } from "@/types/models";

/**
 * ETAPA 5 — Bridge between the storage format (`AppBlock[]`, which is also the
 * Notion conversion target) and the ProseMirror document TipTap edits.
 *
 * Keeping the persisted shape independent from the editor's schema means the
 * import pipeline, search indexer and any future editor share one contract.
 */

type JSONContent = {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: JSONContent[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
};

/* ----------------------------- inline: app -> tiptap ---------------------- */

function spansToInline(spans: RichTextSpan[] | undefined): JSONContent[] {
  if (!spans?.length) return [];
  const out: JSONContent[] = [];

  for (const span of spans) {
    if (span.mention) {
      out.push({
        type: "mention",
        attrs: {
          id: span.mention.kind === "page" ? span.mention.pageId : span.mention.label,
          label: span.mention.label,
        },
      });
      continue;
    }
    if (!span.text) continue;

    const marks: { type: string; attrs?: Record<string, unknown> }[] = [];
    const a = span.annotations ?? {};
    if (a.bold) marks.push({ type: "bold" });
    if (a.italic) marks.push({ type: "italic" });
    if (a.strikethrough) marks.push({ type: "strike" });
    if (a.underline) marks.push({ type: "underline" });
    if (a.code) marks.push({ type: "code" });
    if (span.href) marks.push({ type: "link", attrs: { href: span.href } });

    out.push({ type: "text", text: span.text, ...(marks.length ? { marks } : {}) });
  }

  return out;
}

/* ----------------------------- inline: tiptap -> app ---------------------- */

function inlineToSpans(content: JSONContent[] | undefined): RichTextSpan[] {
  if (!content?.length) return [];
  const spans: RichTextSpan[] = [];

  for (const node of content) {
    if (node.type === "mention") {
      const label = String(node.attrs?.label ?? "");
      spans.push({
        text: `@${label}`,
        mention: { kind: "page", pageId: String(node.attrs?.id ?? ""), label },
      });
      continue;
    }
    if (node.type === "hardBreak") {
      spans.push({ text: "\n" });
      continue;
    }
    if (node.type !== "text" || !node.text) continue;

    const marks = node.marks ?? [];
    const href = marks.find((m) => m.type === "link")?.attrs?.href;
    spans.push({
      text: node.text,
      annotations: {
        bold: marks.some((m) => m.type === "bold") || undefined,
        italic: marks.some((m) => m.type === "italic") || undefined,
        strikethrough: marks.some((m) => m.type === "strike") || undefined,
        underline: marks.some((m) => m.type === "underline") || undefined,
        code: marks.some((m) => m.type === "code") || undefined,
      },
      href: href ? String(href) : undefined,
    });
  }

  return spans;
}

/* ------------------------------ blocks: app -> tiptap --------------------- */

const LIST_WRAPPERS: Partial<Record<BlockType, { wrapper: string; item: string }>> = {
  bulleted_list_item: { wrapper: "bulletList", item: "listItem" },
  numbered_list_item: { wrapper: "orderedList", item: "listItem" },
  todo: { wrapper: "taskList", item: "taskItem" },
};

function blockToNode(block: AppBlock): JSONContent | null {
  const inline = spansToInline(block.richText);
  const paragraph = (content: JSONContent[] = inline): JSONContent => ({
    type: "paragraph",
    ...(content.length ? { content } : {}),
  });

  switch (block.type) {
    case "paragraph":
      return paragraph();
    case "heading_1":
    case "heading_2":
    case "heading_3":
      return {
        type: "heading",
        attrs: { level: Number(block.type.slice(-1)) },
        ...(inline.length ? { content: inline } : {}),
      };
    case "quote":
      return { type: "blockquote", content: [paragraph()] };
    case "divider":
      return { type: "horizontalRule" };
    case "code":
      return {
        type: "codeBlock",
        attrs: { language: block.props?.language ?? null },
        ...(block.richText?.length
          ? { content: [{ type: "text", text: block.richText.map((s) => s.text).join("") }] }
          : {}),
      };
    case "equation":
      return { type: "equationBlock", attrs: { expression: block.props?.expression ?? "" } };
    case "callout":
      return {
        type: "callout",
        attrs: { emoji: block.props?.emoji ?? "💡" },
        content: [paragraph(), ...((block.children ?? []).map(blockToNode).filter(Boolean) as JSONContent[])],
      };
    case "toggle":
      return {
        type: "toggleBlock",
        attrs: {
          summary: (block.richText ?? []).map((s) => s.text).join(""),
          open: true,
        },
        content: blocksToNodes(block.children ?? [{ id: nanoid(), type: "paragraph" }]),
      };
    case "image":
    case "video":
    case "audio":
    case "file":
      return {
        type: "mediaBlock",
        attrs: {
          mediaType: block.type,
          url: block.media?.url ?? "",
          storagePath: block.media?.storagePath ?? null,
          name: block.media?.name ?? "",
          mimeType: block.media?.mimeType ?? "",
          sizeBytes: block.media?.sizeBytes ?? null,
          durationSeconds: block.media?.durationSeconds ?? null,
          ocrText: block.media?.ocrText ?? null,
          transcript: block.media?.transcript ?? null,
          transcriptSummary: block.media?.transcriptSummary ?? null,
          pending: block.media?.pending ?? false,
        },
      };
    case "bookmark":
    case "embed":
      return paragraph([
        {
          type: "text",
          text: block.props?.title || block.props?.url || "Link",
          marks: [{ type: "link", attrs: { href: block.props?.url ?? "#" } }],
        },
      ]);
    case "child_page":
    case "child_database":
      return paragraph([
        { type: "text", text: `↳ ${block.props?.title ?? "Página"}`, marks: [{ type: "bold" }] },
      ]);
    case "table":
      // Rendered as a fenced preview until the native table node ships.
      return {
        type: "codeBlock",
        attrs: { language: "markdown" },
        content: [
          {
            type: "text",
            text: (block.props?.tableRows ?? [])
              .map((row) => row.map((cell) => cell.map((s) => s.text).join("")).join(" | "))
              .join("\n"),
          },
        ],
      };
    default:
      return paragraph();
  }
}

export function blocksToNodes(blocks: AppBlock[]): JSONContent[] {
  const nodes: JSONContent[] = [];
  let index = 0;

  while (index < blocks.length) {
    const block = blocks[index];
    const listConfig = LIST_WRAPPERS[block.type];

    if (listConfig) {
      // Collapse a run of sibling list blocks into a single list node.
      const items: JSONContent[] = [];
      while (index < blocks.length && blocks[index].type === block.type) {
        const current = blocks[index];
        const children = current.children?.length ? blocksToNodes(current.children) : [];
        items.push({
          type: listConfig.item,
          ...(current.type === "todo" ? { attrs: { checked: Boolean(current.props?.checked) } } : {}),
          content: [
            { type: "paragraph", ...(current.richText?.length ? { content: spansToInline(current.richText) } : {}) },
            ...children,
          ],
        });
        index += 1;
      }
      nodes.push({ type: listConfig.wrapper, content: items });
      continue;
    }

    const node = blockToNode(block);
    if (node) nodes.push(node);
    index += 1;
  }

  return nodes;
}

export function blocksToDoc(blocks: AppBlock[]): JSONContent {
  const content = blocksToNodes(blocks);
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}

/* ------------------------------ blocks: tiptap -> app --------------------- */

function nodeToBlocks(node: JSONContent): AppBlock[] {
  const id = () => `blk_${nanoid(8)}`;

  switch (node.type) {
    case "paragraph":
      return [{ id: id(), type: "paragraph", richText: inlineToSpans(node.content) }];
    case "heading": {
      const level = Number(node.attrs?.level ?? 1);
      const type = (`heading_${Math.min(3, Math.max(1, level))}` as BlockType);
      return [{ id: id(), type, richText: inlineToSpans(node.content) }];
    }
    case "blockquote":
      return [
        {
          id: id(),
          type: "quote",
          richText: inlineToSpans(node.content?.[0]?.content),
        },
      ];
    case "horizontalRule":
      return [{ id: id(), type: "divider" }];
    case "codeBlock":
      return [
        {
          id: id(),
          type: "code",
          richText: [{ text: node.content?.map((c) => c.text ?? "").join("") ?? "" }],
          props: { language: (node.attrs?.language as string) ?? "plaintext" },
        },
      ];
    case "equationBlock":
      return [{ id: id(), type: "equation", props: { expression: (node.attrs?.expression as string) ?? "" } }];
    case "callout": {
      const [first, ...rest] = node.content ?? [];
      return [
        {
          id: id(),
          type: "callout",
          richText: inlineToSpans(first?.content),
          props: { emoji: (node.attrs?.emoji as string) ?? "💡" },
          children: rest.flatMap(nodeToBlocks),
        },
      ];
    }
    case "toggleBlock":
      return [
        {
          id: id(),
          type: "toggle",
          richText: [{ text: (node.attrs?.summary as string) ?? "" }],
          children: (node.content ?? []).flatMap(nodeToBlocks),
        },
      ];
    case "mediaBlock": {
      const attrs = node.attrs ?? {};
      const mediaType = (attrs.mediaType as BlockType) ?? "file";
      return [
        {
          id: id(),
          type: mediaType,
          media: {
            url: String(attrs.url ?? ""),
            storagePath: (attrs.storagePath as string) ?? undefined,
            name: String(attrs.name ?? ""),
            mimeType: String(attrs.mimeType ?? ""),
            sizeBytes: attrs.sizeBytes ? Number(attrs.sizeBytes) : undefined,
            durationSeconds: attrs.durationSeconds ? Number(attrs.durationSeconds) : undefined,
            ocrText: (attrs.ocrText as string) ?? undefined,
            transcript: (attrs.transcript as string) ?? undefined,
            transcriptSummary: (attrs.transcriptSummary as string) ?? undefined,
            pending: Boolean(attrs.pending),
          },
        },
      ];
    }
    case "bulletList":
    case "orderedList":
    case "taskList": {
      const type: BlockType =
        node.type === "bulletList"
          ? "bulleted_list_item"
          : node.type === "orderedList"
            ? "numbered_list_item"
            : "todo";
      return (node.content ?? []).map((item) => {
        const [paragraph, ...rest] = item.content ?? [];
        return {
          id: `blk_${nanoid(8)}`,
          type,
          richText: inlineToSpans(paragraph?.content),
          ...(type === "todo" ? { props: { checked: Boolean(item.attrs?.checked) } } : {}),
          ...(rest.length ? { children: rest.flatMap(nodeToBlocks) } : {}),
        };
      });
    }
    default:
      return node.content?.length ? node.content.flatMap(nodeToBlocks) : [];
  }
}

export function docToBlocks(doc: JSONContent): AppBlock[] {
  return (doc.content ?? []).flatMap(nodeToBlocks);
}

/** Flattened text used for the client index, previews and embeddings. */
export function blocksToPlainText(blocks: AppBlock[]): string {
  const out: string[] = [];
  const walk = (list: AppBlock[]) => {
    for (const block of list) {
      if (block.richText?.length) out.push(block.richText.map((s) => s.text).join(""));
      if (block.props?.expression) out.push(block.props.expression);
      if (block.media?.name) out.push(block.media.name);
      if (block.children?.length) walk(block.children);
    }
  };
  walk(blocks);
  return out.filter(Boolean).join("\n");
}

/** Page ids referenced by @-mentions — the source of truth for backlinks. */
export function collectMentionIds(blocks: AppBlock[]): string[] {
  const ids = new Set<string>();
  const walk = (list: AppBlock[]) => {
    for (const block of list) {
      for (const span of block.richText ?? []) {
        if (span.mention?.kind === "page" && span.mention.pageId) ids.add(span.mention.pageId);
      }
      if (block.children?.length) walk(block.children);
    }
  };
  walk(blocks);
  return [...ids];
}
