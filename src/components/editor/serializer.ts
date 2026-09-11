import { nanoid } from "nanoid";
import type { AppBlock, BlockType, RichTextSpan } from "@/types/models";
import { fromTableRows, fromTableRowsAlignments, toTableRows } from "@/lib/data/table-rows";


type JSONContent = {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: JSONContent[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
};


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
    if (a.highlight) {
      marks.push({
        type: "highlight",
        ...(typeof a.highlight === "string" ? { attrs: { color: a.highlight } } : {}),
      });
    }
    if (a.color) marks.push({ type: "textStyle", attrs: { color: a.color } });
    if (span.href) marks.push({ type: "link", attrs: { href: span.href } });

    out.push({ type: "text", text: span.text, ...(marks.length ? { marks } : {}) });
  }

  return out;
}


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
    const highlightMark = marks.find((m) => m.type === "highlight");
    const color = marks.find((m) => m.type === "textStyle")?.attrs?.color;
    const annotations: RichTextSpan["annotations"] = {};
    if (marks.some((m) => m.type === "bold")) annotations.bold = true;
    if (marks.some((m) => m.type === "italic")) annotations.italic = true;
    if (marks.some((m) => m.type === "strike")) annotations.strikethrough = true;
    if (marks.some((m) => m.type === "underline")) annotations.underline = true;
    if (marks.some((m) => m.type === "code")) annotations.code = true;
    if (highlightMark) annotations.highlight = (highlightMark.attrs?.color as string) || true;
    if (color) annotations.color = String(color);

    spans.push({
      text: node.text,
      ...(Object.keys(annotations).length ? { annotations } : {}),
      ...(href ? { href: String(href) } : {}),
    });
  }

  return spans;
}


const LIST_WRAPPERS: Partial<Record<BlockType, { wrapper: string; item: string }>> = {
  bulleted_list_item: { wrapper: "bulletList", item: "listItem" },
  numbered_list_item: { wrapper: "orderedList", item: "listItem" },
  todo: { wrapper: "taskList", item: "taskItem" },
};

function paragraphAttrs(block: AppBlock): Record<string, unknown> | undefined {
  const attrs: Record<string, unknown> = {};
  if (block.props?.indentFirst) attrs.indentFirst = true;
  if (typeof block.props?.indent === "number" && block.props.indent > 0) {
    attrs.indent = block.props.indent;
  }
  if (block.props?.textAlign && block.props.textAlign !== "justify") {
    attrs.textAlign = block.props.textAlign;
  }
  return Object.keys(attrs).length ? attrs : undefined;
}

function headingAttrs(block: AppBlock, level: number): Record<string, unknown> {
  const attrs: Record<string, unknown> = { level };
  if (typeof block.props?.indent === "number" && block.props.indent > 0) {
    attrs.indent = block.props.indent;
  }
  if (block.props?.textAlign && block.props.textAlign !== "left") {
    attrs.textAlign = block.props.textAlign;
  }
  return attrs;
}

function persistedAlignProps(
  node: JSONContent,
  extra?: Record<string, unknown>
): { props: Record<string, unknown> } | Record<string, never> {
  const props: Record<string, unknown> = { ...extra };
  const align = node.attrs?.textAlign;
  const fallback = node.type === "heading" ? "left" : "justify";
  if (typeof align === "string" && align !== fallback) props.textAlign = align;
  const indent = Number(node.attrs?.indent ?? 0);
  if (indent > 0) props.indent = indent;
  return Object.keys(props).length ? { props } : {};
}

function blockToNode(block: AppBlock): JSONContent | null {
  const inline = spansToInline(block.richText);
  const paragraph = (
    content: JSONContent[] = inline,
    attrs?: Record<string, unknown>
  ): JSONContent => ({
    type: "paragraph",
    ...(attrs && Object.keys(attrs).length ? { attrs } : {}),
    ...(content.length ? { content } : {}),
  });

  switch (block.type) {
    case "paragraph":
      return paragraph(inline, paragraphAttrs(block));
    case "heading_1":
    case "heading_2":
    case "heading_3":
      return {
        type: "heading",
        attrs: headingAttrs(block, Number(block.type.slice(-1))),
        ...(inline.length ? { content: inline } : {}),
      };
    case "quote":
      return {
        type: "blockquote",
        ...(block.props?.indent ? { attrs: { indent: block.props.indent } } : {}),
        content: [paragraph()],
      };
    case "divider":
      return { type: "horizontalRule" };
    case "code":
      return {
        type: "codeBlock",
        attrs: {
          language:
            block.props?.language && block.props.language !== "auto"
              ? block.props.language
              : "plaintext",
          autoDetect: block.props?.language === "auto" || Boolean(block.props?.autoDetect) || !block.props?.language,
        },
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
    case "toggle": {
      const level = (block.props?.level as 1 | 2 | 3 | undefined) ?? undefined;
      const headerNode: JSONContent = level
        ? {
            type: "heading",
            attrs: headingAttrs(block, level),
            ...(inline.length ? { content: inline } : {}),
          }
        : paragraph(inline, paragraphAttrs(block));

      const childrenNodes = block.children?.length
        ? blocksToNodes(block.children)
        : [];

      return {
        type: "toggleBlock",
        attrs: {
          open: block.props?.open !== undefined ? Boolean(block.props.open) : true,
        },
        content: [headerNode, ...childrenNodes],
      };
    }
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
          transcript: block.media?.transcript ?? null,
          transcriptSummary: block.media?.transcriptSummary ?? null,
          pending: block.media?.pending ?? false,
          displayWidth: block.media?.displayWidth ?? null,
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
      return {
        type: "tableBlock",
        attrs: {
          hasColumnHeader: Boolean(block.props?.hasColumnHeader),
          rows: fromTableRows(block.props?.tableRows),
          colWidths: block.props?.colWidths ?? [],
          rowHeights: block.props?.rowHeights ?? [],
          cellAlignments: fromTableRowsAlignments(block.props?.tableRows),
        },
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


function nodeToBlocks(node: JSONContent): AppBlock[] {
  const id = () => `blk_${nanoid(8)}`;

  switch (node.type) {
    case "paragraph":
      return [
        {
          id: id(),
          type: "paragraph",
          richText: inlineToSpans(node.content),
          ...persistedAlignProps(node, node.attrs?.indentFirst ? { indentFirst: true } : undefined),
        },
      ];
    case "heading": {
      const level = Number(node.attrs?.level ?? 1);
      const type = (`heading_${Math.min(3, Math.max(1, level))}` as BlockType);
      return [{ id: id(), type, richText: inlineToSpans(node.content), ...persistedAlignProps(node) }];
    }
    case "blockquote": {
      const indent = Number(node.attrs?.indent ?? 0);
      return [
        {
          id: id(),
          type: "quote",
          richText: inlineToSpans(node.content?.[0]?.content),
          ...(indent > 0 ? { props: { indent } } : {}),
        },
      ];
    }
    case "horizontalRule":
      return [{ id: id(), type: "divider" }];
    case "codeBlock":
      return [
        {
          id: id(),
          type: "code",
          richText: [{ text: node.content?.map((c) => c.text ?? "").join("") ?? "" }],
          props: {
            language: (node.attrs?.language as string) ?? "plaintext",
            ...(node.attrs?.autoDetect ? { autoDetect: true } : {}),
          },
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
    case "toggleBlock": {
      const [first, ...rest] = node.content ?? [];
      const isHeading = first?.type === "heading";
      const level = isHeading ? (Number(first?.attrs?.level) as 1 | 2 | 3) : undefined;
      return [
        {
          id: id(),
          type: "toggle",
          richText: inlineToSpans(first?.content),
          props: {
            open: node.attrs?.open !== undefined ? Boolean(node.attrs.open) : true,
            ...(level ? { level } : {}),
          },
          children: rest.flatMap(nodeToBlocks),
        },
      ];
    }
    case "tableBlock": {
      const rows = (node.attrs?.rows as RichTextSpan[][][] | undefined) ?? [];
      const cellAlignments = (node.attrs?.cellAlignments as any) ?? [];
      return [
        {
          id: id(),
          type: "table",
          props: {
            hasColumnHeader: Boolean(node.attrs?.hasColumnHeader),
            tableRows: toTableRows(rows, cellAlignments),
            colWidths: (node.attrs?.colWidths as number[] | undefined) ?? [],
            rowHeights: (node.attrs?.rowHeights as number[] | undefined) ?? [],
          },
        },
      ];
    }
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
            transcript: (attrs.transcript as string) ?? undefined,
            transcriptSummary: (attrs.transcriptSummary as string) ?? undefined,
            pending: Boolean(attrs.pending),
            displayWidth: attrs.displayWidth ? Number(attrs.displayWidth) : undefined,
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

export function blocksToPlainText(blocks: AppBlock[]): string {
  const out: string[] = [];
  const walk = (list: AppBlock[]) => {
    for (const block of list) {
      if (block.richText?.length) out.push(block.richText.map((s) => s.text).join(""));
      if (block.props?.expression) out.push(block.props.expression);
      if (block.props?.tableRows?.length) {
        out.push(
          fromTableRows(block.props.tableRows)
            .map((row) => row.map((cell) => cell.map((span) => span.text).join("")).join("\t"))
            .join("\n")
        );
      }
      if (block.media?.name) out.push(block.media.name);
      if (block.children?.length) walk(block.children);
    }
  };
  walk(blocks);
  return out.filter(Boolean).join("\n");
}

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
