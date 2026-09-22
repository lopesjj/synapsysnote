import { nanoid } from "nanoid";
import type { AppBlock, BlockType, RichTextAnnotations, RichTextSpan, TableCell, TableRow } from "@/types/models";
import {
  attr,
  childElements,
  findDescendants,
  isElement,
  isText,
  textContent,
  type ParsedElement,
  type ParsedNode,
} from "./dom";
import {
  colorLuminance,
  createStyleResolver,
  normalizeColor,
  parseLengthPx,
  parseStyleSheet,
  type StyleRule,
} from "./css";
import { snapHighlightColor, snapTextColor } from "./palette";
import type { ImportWarningCode } from "./types";

export interface HtmlMediaResolution {
  url: string;
  name?: string;
  mimeType?: string;
  sizeBytes?: number;
  width?: number;
  height?: number;
  kind?: "image" | "video" | "audio" | "file";
}

export interface HtmlConvertOptions {
  resolveMedia?: (element: ParsedElement) => HtmlMediaResolution | null;
  onWarning?: (code: ImportWarningCode) => void;
  extraStyleRules?: StyleRule[];
}

export type TextAlignValue = "left" | "center" | "right" | "justify";

const MAX_INDENT = 8;
const INDENT_PX = 48;
const MAX_DEPTH = 64;

const INLINE_TAGS = new Set([
  "a",
  "abbr",
  "acronym",
  "b",
  "bdi",
  "bdo",
  "big",
  "br",
  "cite",
  "code",
  "data",
  "del",
  "dfn",
  "em",
  "en-crypt",
  "en-media",
  "en-todo",
  "font",
  "i",
  "img",
  "input",
  "ins",
  "kbd",
  "label",
  "mark",
  "nobr",
  "q",
  "rp",
  "rt",
  "ruby",
  "s",
  "samp",
  "small",
  "span",
  "strike",
  "strong",
  "sub",
  "sup",
  "time",
  "tt",
  "u",
  "var",
  "wbr",
]);

const SKIPPED_TAGS = new Set([
  "base",
  "col",
  "colgroup",
  "head",
  "link",
  "meta",
  "noscript",
  "script",
  "style",
  "title",
]);

const TRANSPARENT_TAGS = new Set([
  "#root",
  "article",
  "aside",
  "body",
  "en-note",
  "footer",
  "form",
  "header",
  "html",
  "main",
  "nav",
  "picture",
  "section",
]);

const MONOSPACE_PATTERN = /courier|consolas|monaco|menlo|monospace|lucida console|roboto mono|source code/i;

function blockId(): string {
  return `blk_${nanoid(8)}`;
}

function isBlockTag(name: string): boolean {
  return !INLINE_TAGS.has(name);
}

function hasBlockChild(element: ParsedElement): boolean {
  for (const child of element.children) {
    if (!isElement(child)) continue;
    if (SKIPPED_TAGS.has(child.name)) continue;
    if (isBlockTag(child.name)) return true;
  }
  return false;
}

function annotationsEqual(a: RichTextAnnotations | undefined, b: RichTextAnnotations | undefined): boolean {
  const left = a ?? {};
  const right = b ?? {};
  return (
    Boolean(left.bold) === Boolean(right.bold) &&
    Boolean(left.italic) === Boolean(right.italic) &&
    Boolean(left.underline) === Boolean(right.underline) &&
    Boolean(left.strikethrough) === Boolean(right.strikethrough) &&
    Boolean(left.code) === Boolean(right.code) &&
    (left.color ?? "") === (right.color ?? "") &&
    String(left.highlight ?? "") === String(right.highlight ?? "")
  );
}

function cleanAnnotations(annotations: RichTextAnnotations): RichTextAnnotations | undefined {
  const out: RichTextAnnotations = {};
  if (annotations.bold) out.bold = true;
  if (annotations.italic) out.italic = true;
  if (annotations.underline) out.underline = true;
  if (annotations.strikethrough) out.strikethrough = true;
  if (annotations.code) out.code = true;
  if (annotations.color) out.color = annotations.color;
  if (annotations.highlight) out.highlight = annotations.highlight;
  return Object.keys(out).length ? out : undefined;
}

export function normalizeHref(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  const value = raw.trim();
  if (!value) return undefined;
  const lower = value.toLowerCase();
  if (lower.startsWith("javascript:") || lower.startsWith("vbscript:") || lower.startsWith("data:")) {
    return undefined;
  }
  if (value.startsWith("#")) return undefined;
  if (lower.startsWith("https://www.google.com/url") || lower.startsWith("https://google.com/url")) {
    try {
      const url = new URL(value);
      const target = url.searchParams.get("q") ?? url.searchParams.get("url");
      if (target) return normalizeHref(target);
    } catch {
      return value;
    }
  }
  return value;
}

export function mergeSpans(spans: RichTextSpan[]): RichTextSpan[] {
  const out: RichTextSpan[] = [];
  for (const span of spans) {
    if (!span.text) continue;
    const last = out[out.length - 1];
    if (
      last &&
      !last.mention &&
      !span.mention &&
      (last.href ?? "") === (span.href ?? "") &&
      annotationsEqual(last.annotations, span.annotations)
    ) {
      out[out.length - 1] = { ...last, text: last.text + span.text };
      continue;
    }
    out.push({ ...span });
  }
  return out;
}

function trimSpans(spans: RichTextSpan[]): RichTextSpan[] {
  const merged = mergeSpans(spans);
  if (!merged.length) return merged;
  merged[0] = { ...merged[0], text: merged[0].text.replace(/^[ \t]+/, "") };
  const lastIndex = merged.length - 1;
  merged[lastIndex] = { ...merged[lastIndex], text: merged[lastIndex].text.replace(/[ \t]+$/, "") };
  return merged.filter((span) => span.text.length > 0);
}

export function spansPlainText(spans: RichTextSpan[] | undefined): string {
  return (spans ?? []).map((span) => span.text).join("");
}

interface InheritedStyle {
  annotations: RichTextAnnotations;
  textAlign?: TextAlignValue;
  indent?: number;
}

interface ConvertContext {
  resolveStyle: (element: ParsedElement) => Record<string, string>;
  resolveMedia?: (element: ParsedElement) => HtmlMediaResolution | null;
  warn: (code: ImportWarningCode) => void;
}

interface InlineState {
  annotations: RichTextAnnotations;
  href?: string;
  preserve: boolean;
}

interface BlockSink {
  spans: RichTextSpan[];
  todo: { checked: boolean } | null;
  flush: () => void;
  emit: (block: AppBlock) => void;
}

function styleAnnotations(
  element: ParsedElement,
  ctx: ConvertContext,
  base: RichTextAnnotations
): RichTextAnnotations {
  const style = ctx.resolveStyle(element);
  const next: RichTextAnnotations = { ...base };

  const weight = style["font-weight"];
  if (weight) {
    const numeric = Number.parseInt(weight, 10);
    if (Number.isFinite(numeric)) next.bold = numeric >= 600;
    else if (weight === "bold" || weight === "bolder") next.bold = true;
    else if (weight === "normal" || weight === "lighter") next.bold = false;
  }

  const fontStyle = style["font-style"];
  if (fontStyle === "italic" || fontStyle === "oblique") next.italic = true;
  else if (fontStyle === "normal") next.italic = false;

  const decoration = style["text-decoration-line"] ?? style["text-decoration"];
  if (decoration) {
    const lower = decoration.toLowerCase();
    const underline = lower.includes("underline");
    const lineThrough = lower.includes("line-through");
    if (underline) next.underline = true;
    if (lineThrough) next.strikethrough = true;
    if (lower.includes("none")) {
      if (!underline) next.underline = false;
      if (!lineThrough) next.strikethrough = false;
    }
  }

  const family = style["font-family"];
  if (family && MONOSPACE_PATTERN.test(family)) next.code = true;

  const background = normalizeColor(style["background-color"] ?? style.background);
  if (background && colorLuminance(background) < 0.97) next.highlight = background;

  const color = normalizeColor(style.color);
  if (color) {
    const luminance = colorLuminance(color);
    if (luminance > 0.08 && luminance < 0.94) next.color = color;
    else if (next.highlight) next.color = color;
    else delete next.color;
  }

  return next;
}

function elementAnnotations(
  element: ParsedElement,
  ctx: ConvertContext,
  base: RichTextAnnotations
): RichTextAnnotations {
  const next: RichTextAnnotations = { ...base };
  switch (element.name) {
    case "b":
    case "strong":
      next.bold = true;
      break;
    case "i":
    case "em":
    case "cite":
    case "dfn":
    case "var":
      next.italic = true;
      break;
    case "u":
    case "ins":
      next.underline = true;
      break;
    case "s":
    case "strike":
    case "del":
      next.strikethrough = true;
      break;
    case "code":
    case "kbd":
    case "samp":
    case "tt":
      next.code = true;
      break;
    case "mark":
      next.highlight = true;
      break;
    default:
      break;
  }

  if (element.name === "font") {
    const color = normalizeColor(attr(element, "color"));
    if (color) {
      const luminance = colorLuminance(color);
      if (luminance > 0.08 && luminance < 0.94) next.color = color;
    }
    const face = attr(element, "face");
    if (face && MONOSPACE_PATTERN.test(face)) next.code = true;
  }

  return styleAnnotations(element, ctx, next);
}

function mediaTypeFor(resolution: HtmlMediaResolution): BlockType {
  if (resolution.kind) return resolution.kind;
  const mime = (resolution.mimeType ?? "").toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "file";
}

function mediaBlock(resolution: HtmlMediaResolution): AppBlock {
  return {
    id: blockId(),
    type: mediaTypeFor(resolution),
    media: {
      url: resolution.url,
      name: resolution.name ?? "",
      ...(resolution.mimeType ? { mimeType: resolution.mimeType } : {}),
      ...(resolution.sizeBytes ? { sizeBytes: resolution.sizeBytes } : {}),
      ...(resolution.width ? { width: resolution.width } : {}),
      ...(resolution.height ? { height: resolution.height } : {}),
      pending: false,
    },
  };
}

export function guessNameFromUrl(url: string, fallback: string): string {
  try {
    const clean = url.split("?")[0].split("#")[0];
    const last = decodeURIComponent(clean.split("/").pop() ?? "");
    return last || fallback;
  } catch {
    return fallback;
  }
}

function imageResolution(element: ParsedElement, ctx: ConvertContext): HtmlMediaResolution | null {
  const custom = ctx.resolveMedia?.(element);
  if (custom) return custom;
  const src = attr(element, "src") ?? attr(element, "data-src");
  if (!src) return null;
  const style = ctx.resolveStyle(element);
  const width = parseLengthPx(attr(element, "width") ?? style.width);
  const height = parseLengthPx(attr(element, "height") ?? style.height);
  return {
    url: src,
    name: attr(element, "alt") || guessNameFromUrl(src, "image"),
    kind: "image",
    ...(width ? { width: Math.round(width) } : {}),
    ...(height ? { height: Math.round(height) } : {}),
  };
}

function collapseText(value: string, preserve: boolean): string {
  if (preserve) return value;
  return value.replace(/[\t\n\r\f ]+/g, " ");
}

function appendInline(
  nodes: ParsedNode[],
  state: InlineState,
  sink: BlockSink,
  ctx: ConvertContext,
  inherit: InheritedStyle,
  depth: number
) {
  for (const node of nodes) {
    if (isText(node)) {
      const text = collapseText(node.value, state.preserve);
      if (!text) continue;
      const annotations = cleanAnnotations(state.annotations);
      sink.spans.push({
        text,
        ...(annotations ? { annotations } : {}),
        ...(state.href ? { href: state.href } : {}),
      });
      continue;
    }
    if (!isElement(node)) continue;
    const name = node.name;
    if (SKIPPED_TAGS.has(name)) continue;

    if (name === "br") {
      sink.spans.push({ text: "\n" });
      continue;
    }
    if (name === "wbr" || name === "rp") continue;

    if (name === "en-todo") {
      sink.todo = { checked: attr(node, "checked") === "true" };
      continue;
    }

    if (name === "input") {
      const type = (attr(node, "type") ?? "").toLowerCase();
      if (type === "checkbox") {
        const checked = node.attrs.checked;
        sink.todo = { checked: checked !== undefined && checked !== "false" };
      }
      continue;
    }

    if (name === "en-crypt") {
      ctx.warn("encrypted_content");
      continue;
    }

    if (name === "img" || name === "en-media") {
      const resolution = name === "en-media" ? (ctx.resolveMedia?.(node) ?? null) : imageResolution(node, ctx);
      if (resolution) sink.emit(mediaBlock(resolution));
      else ctx.warn("missing_asset");
      continue;
    }

    if (name === "a") {
      const href = normalizeHref(attr(node, "href"));
      const children = childElements(node);
      const onlyImage = children.length === 1 && children[0].name === "img" && !textContent(node).trim();
      if (onlyImage) {
        appendInline(node.children, state, sink, ctx, inherit, depth + 1);
        continue;
      }
      appendInline(
        node.children,
        {
          ...state,
          href: href ?? state.href,
          annotations: elementAnnotations(node, ctx, state.annotations),
        },
        sink,
        ctx,
        inherit,
        depth + 1
      );
      continue;
    }

    if (isBlockTag(name)) {
      sink.flush();
      const nested = convertBlockElement(node, ctx, { ...inherit, annotations: state.annotations }, depth + 1);
      for (const block of nested) sink.emit(block);
      continue;
    }

    appendInline(
      node.children,
      { ...state, annotations: elementAnnotations(node, ctx, state.annotations) },
      sink,
      ctx,
      inherit,
      depth + 1
    );
  }
}

function alignmentOf(element: ParsedElement, ctx: ConvertContext): TextAlignValue | null {
  const style = ctx.resolveStyle(element);
  const raw = (style["text-align"] ?? attr(element, "align") ?? "").toLowerCase().trim();
  if (!raw) return null;
  if (raw === "center") return "center";
  if (raw === "right" || raw === "end") return "right";
  if (raw === "justify" || raw === "justify-all") return "justify";
  if (raw === "left" || raw === "start") return "left";
  return null;
}

function indentOf(element: ParsedElement, ctx: ConvertContext): number {
  const style = ctx.resolveStyle(element);
  const margin = parseLengthPx(style["margin-left"]) ?? 0;
  const padding = parseLengthPx(style["padding-left"]) ?? 0;
  const total = margin + padding;
  if (total < INDENT_PX * 0.6) return 0;
  return Math.min(MAX_INDENT, Math.max(1, Math.round(total / INDENT_PX)));
}

function inheritFrom(element: ParsedElement, ctx: ConvertContext, inherit: InheritedStyle): InheritedStyle {
  const indent = TRANSPARENT_TAGS.has(element.name) ? 0 : indentOf(element, ctx);
  return {
    annotations: styleAnnotations(element, ctx, inherit.annotations),
    textAlign: alignmentOf(element, ctx) ?? inherit.textAlign,
    indent: indent || inherit.indent,
  };
}

function textBlockProps(
  element: ParsedElement,
  type: BlockType,
  ctx: ConvertContext,
  inherit: InheritedStyle
): AppBlock["props"] | undefined {
  const props: NonNullable<AppBlock["props"]> = {};
  const align = alignmentOf(element, ctx) ?? inherit.textAlign ?? null;
  const isHeading = type === "heading_1" || type === "heading_2" || type === "heading_3";

  if (type === "paragraph" || type === "quote") props.textAlign = align ?? "left";
  else if (align && align !== "left" && (isHeading || type === "todo")) props.textAlign = align;

  const indent = indentOf(element, ctx) || inherit.indent || 0;
  if (indent > 0) props.indent = indent;

  const firstLine = parseLengthPx(ctx.resolveStyle(element)["text-indent"]);
  if (firstLine && firstLine > 4 && type === "paragraph") props.indentFirst = true;

  return Object.keys(props).length ? props : undefined;
}

function makeTextBlock(
  type: BlockType,
  spans: RichTextSpan[],
  source: ParsedElement,
  ctx: ConvertContext,
  inherit: InheritedStyle,
  todo: { checked: boolean } | null
): AppBlock {
  const finalType: BlockType = todo ? "todo" : type;
  const props = textBlockProps(source, finalType, ctx, inherit);
  const merged = { ...(props ?? {}), ...(todo ? { checked: todo.checked } : {}) };
  return {
    id: blockId(),
    type: finalType,
    richText: spans,
    ...(Object.keys(merged).length ? { props: merged } : {}),
  };
}

function createSink(
  out: AppBlock[],
  element: ParsedElement,
  ctx: ConvertContext,
  inherit: InheritedStyle,
  defaultType: BlockType,
  preserve: boolean
): BlockSink {
  const sink: BlockSink = {
    spans: [],
    todo: null,
    flush: () => {
      const spans = preserve ? mergeSpans(sink.spans) : trimSpans(sink.spans);
      const todo = sink.todo;
      sink.spans = [];
      sink.todo = null;
      if (!spans.length && !todo) return;
      const meaningful = preserve || spansPlainText(spans).trim() ? spans : [];
      out.push(makeTextBlock(defaultType, meaningful, element, ctx, inherit, todo));
    },
    emit: (block) => {
      sink.flush();
      out.push(block);
    },
  };
  return sink;
}

function flattenToText(element: ParsedElement, defaultType: BlockType = "paragraph"): AppBlock[] {
  const text = collapseText(textContent(element), false).trim();
  if (!text) return [];
  return [{ id: blockId(), type: defaultType, richText: [{ text }], props: { textAlign: "left" } }];
}

function convertContainer(
  element: ParsedElement,
  ctx: ConvertContext,
  inherit: InheritedStyle,
  depth: number,
  defaultType: BlockType = "paragraph"
): AppBlock[] {
  if (depth > MAX_DEPTH) return flattenToText(element, defaultType);
  const out: AppBlock[] = [];
  const nextInherit = inheritFrom(element, ctx, inherit);
  const sink = createSink(out, element, ctx, inherit, defaultType, false);
  appendInline(element.children, { annotations: nextInherit.annotations, preserve: false }, sink, ctx, nextInherit, depth);
  sink.flush();
  return out;
}

function convertChildren(
  element: ParsedElement,
  ctx: ConvertContext,
  inherit: InheritedStyle,
  depth: number
): AppBlock[] {
  if (depth > MAX_DEPTH) return flattenToText(element);
  const out: AppBlock[] = [];
  const nextInherit = inheritFrom(element, ctx, inherit);
  const sink = createSink(out, element, ctx, inherit, "paragraph", false);

  for (const child of element.children) {
    if (isText(child)) {
      const text = collapseText(child.value, false);
      if (!text.trim()) continue;
      const annotations = cleanAnnotations(nextInherit.annotations);
      sink.spans.push({ text, ...(annotations ? { annotations } : {}) });
      continue;
    }
    if (!isElement(child)) continue;
    if (SKIPPED_TAGS.has(child.name)) continue;
    if (isBlockTag(child.name)) {
      sink.flush();
      out.push(...convertBlockElement(child, ctx, nextInherit, depth));
      continue;
    }
    appendInline([child], { annotations: nextInherit.annotations, preserve: false }, sink, ctx, nextInherit, depth);
  }
  sink.flush();
  return out;
}

function rawText(element: ParsedElement): string {
  let out = "";
  const walk = (node: ParsedNode) => {
    if (isText(node)) {
      out += node.value;
      return;
    }
    if (!isElement(node)) return;
    if (node.name === "br") {
      out += "\n";
      return;
    }
    if (SKIPPED_TAGS.has(node.name)) return;
    for (const child of node.children) walk(child);
    if (node.name === "div" || node.name === "p") out += "\n";
  };
  for (const child of element.children) walk(child);
  return out;
}

function codeLanguageOf(element: ParsedElement): string {
  const candidates = [element, ...childElements(element, "code")];
  for (const candidate of candidates) {
    const className = attr(candidate, "class") ?? "";
    const match = /(?:language|lang|brush|highlight-source)[-:]([a-z0-9+#]+)/i.exec(className);
    if (match) return match[1].toLowerCase();
    const dataLang = attr(candidate, "data-language") ?? attr(candidate, "data-lang");
    if (dataLang) return dataLang.toLowerCase();
  }
  return "plaintext";
}

function convertList(
  element: ParsedElement,
  ctx: ConvertContext,
  inherit: InheritedStyle,
  depth: number
): AppBlock[] {
  const ordered = element.name === "ol";
  const nextInherit = inheritFrom(element, ctx, inherit);
  const out: AppBlock[] = [];

  for (const child of childElements(element)) {
    if (child.name === "ul" || child.name === "ol" || child.name === "menu") {
      const nested = convertList(child, ctx, nextInherit, depth + 1);
      const previous = out[out.length - 1];
      if (previous) previous.children = [...(previous.children ?? []), ...nested];
      else out.push(...nested);
      continue;
    }
    if (child.name !== "li") continue;

    const blocks = convertContainer(child, ctx, { ...nextInherit, indent: undefined }, depth + 1);
    const first = blocks[0];
    const leading = first && (first.type === "paragraph" || first.type === "todo") ? first : null;
    const checked = leading && leading.type === "todo" ? Boolean(leading.props?.checked) : null;
    const type: BlockType = checked !== null ? "todo" : ordered ? "numbered_list_item" : "bulleted_list_item";
    const rest = leading ? blocks.slice(1) : blocks;

    out.push({
      id: blockId(),
      type,
      richText: leading?.richText ?? [],
      ...(checked !== null ? { props: { checked } } : {}),
      ...(rest.length ? { children: rest } : {}),
    });
  }

  return out;
}

function collectRows(element: ParsedElement): ParsedElement[] {
  const rows: ParsedElement[] = [];
  const walk = (node: ParsedElement) => {
    for (const child of childElements(node)) {
      if (child.name === "table") continue;
      if (child.name === "tr") {
        rows.push(child);
        continue;
      }
      walk(child);
    }
  };
  walk(element);
  return rows;
}

function cellSpans(cell: ParsedElement, ctx: ConvertContext, inherit: InheritedStyle, depth: number): RichTextSpan[] {
  const blocks = convertContainer(cell, ctx, { ...inherit, indent: undefined, textAlign: undefined }, depth + 1);
  const spans: RichTextSpan[] = [];
  for (const block of blocks) {
    if (block.type === "table") {
      ctx.warn("nested_table");
      for (const row of block.props?.tableRows ?? []) {
        if (spans.length) spans.push({ text: "\n" });
        row.cells.forEach((entry, index) => {
          if (index > 0) spans.push({ text: " | " });
          spans.push(...entry.spans);
        });
      }
      continue;
    }
    const text = block.richText ?? [];
    const label = !text.length && block.media?.name ? [{ text: block.media.name }] : [];
    const content = text.length ? text : label;
    if (!content.length) continue;
    if (spans.length) spans.push({ text: "\n" });
    spans.push(...content);
  }
  return mergeSpans(spans);
}

function cellAlignment(cell: ParsedElement, ctx: ConvertContext) {
  const style = ctx.resolveStyle(cell);
  const firstBlock = childElements(cell).find((child) => child.name === "p" || child.name === "div");
  const inner = firstBlock ? ctx.resolveStyle(firstBlock) : undefined;
  const horizontalRaw = (
    style["text-align"] ??
    attr(cell, "align") ??
    inner?.["text-align"] ??
    (firstBlock ? attr(firstBlock, "align") : undefined) ??
    ""
  ).toLowerCase();
  const verticalRaw = (style["vertical-align"] ?? attr(cell, "valign") ?? "").toLowerCase();
  const horizontal =
    horizontalRaw === "center"
      ? ("center" as const)
      : horizontalRaw === "right" || horizontalRaw === "end"
        ? ("right" as const)
        : horizontalRaw === "left" || horizontalRaw === "start"
          ? ("left" as const)
          : undefined;
  const vertical =
    verticalRaw === "middle" || verticalRaw === "center"
      ? ("middle" as const)
      : verticalRaw === "bottom"
        ? ("bottom" as const)
        : verticalRaw === "top"
          ? ("top" as const)
          : undefined;
  return { horizontal, vertical };
}

function convertTable(
  element: ParsedElement,
  ctx: ConvertContext,
  inherit: InheritedStyle,
  depth: number
): AppBlock {
  const rowElements = collectRows(element);
  const grid: (TableCell | null)[][] = [];
  const occupied: boolean[][] = [];

  const ensure = (rowIndex: number) => {
    while (grid.length <= rowIndex) {
      grid.push([]);
      occupied.push([]);
    }
  };

  rowElements.forEach((row, rowIndex) => {
    ensure(rowIndex);
    let columnIndex = 0;
    for (const cell of childElements(row)) {
      if (cell.name !== "td" && cell.name !== "th") continue;
      while (occupied[rowIndex][columnIndex]) columnIndex += 1;
      const colSpan = Math.min(32, Math.max(1, Number.parseInt(attr(cell, "colspan") ?? "1", 10) || 1));
      const rowSpan = Math.min(64, Math.max(1, Number.parseInt(attr(cell, "rowspan") ?? "1", 10) || 1));
      const alignment = cellAlignment(cell, ctx);
      const spans = cellSpans(cell, ctx, inherit, depth);

      for (let r = 0; r < rowSpan; r += 1) {
        ensure(rowIndex + r);
        for (let c = 0; c < colSpan; c += 1) {
          occupied[rowIndex + r][columnIndex + c] = true;
          grid[rowIndex + r][columnIndex + c] =
            r === 0 && c === 0
              ? {
                  spans,
                  ...(alignment.horizontal ? { horizontalAlign: alignment.horizontal } : {}),
                  ...(alignment.vertical ? { verticalAlign: alignment.vertical } : {}),
                }
              : { spans: [] };
        }
      }
      columnIndex += colSpan;
    }
  });

  const columnCount = grid.reduce((max, row) => Math.max(max, row.length), 0);
  const tableRows: TableRow[] = grid.map((row) => ({
    cells: Array.from({ length: columnCount }, (_, index) => row[index] ?? { spans: [] }),
  }));

  const headerCells = rowElements.length
    ? childElements(rowElements[0]).filter((cell) => cell.name === "td" || cell.name === "th")
    : [];
  const hasColumnHeader = Boolean(
    findDescendants(element, "thead").length ||
      (headerCells.length > 0 && headerCells.every((cell) => cell.name === "th"))
  );

  const colWidths: number[] = [];
  for (const col of findDescendants(element, "col")) {
    const width = parseLengthPx(attr(col, "width") ?? ctx.resolveStyle(col).width);
    colWidths.push(width ? Math.round(width) : 0);
  }
  if (!colWidths.length) {
    for (const cell of headerCells) {
      const width = parseLengthPx(attr(cell, "width") ?? ctx.resolveStyle(cell).width);
      colWidths.push(width ? Math.round(width) : 0);
    }
  }

  return {
    id: blockId(),
    type: "table",
    props: {
      hasColumnHeader,
      tableRows,
      ...(colWidths.some((width) => width > 0) ? { colWidths } : {}),
    },
  };
}

function classListOf(element: ParsedElement): string[] {
  return (element.attrs.class ?? "").split(/\s+/).filter(Boolean);
}

function documentHeadingType(element: ParsedElement): BlockType | null {
  const classes = classListOf(element);
  if (classes.includes("title")) return "heading_1";
  if (classes.includes("subtitle")) return "heading_2";
  return null;
}

function isHidden(element: ParsedElement, ctx: ConvertContext): boolean {
  const style = ctx.resolveStyle(element);
  return style.display === "none" || style.visibility === "hidden";
}

function convertBlockElement(
  element: ParsedElement,
  ctx: ConvertContext,
  inherit: InheritedStyle,
  depth: number
): AppBlock[] {
  const name = element.name;
  if (SKIPPED_TAGS.has(name)) return [];
  if (depth > MAX_DEPTH) return flattenToText(element);
  if (isHidden(element, ctx)) return [];

  switch (name) {
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6": {
      const level = Math.min(3, Number.parseInt(name.slice(1), 10));
      const type = `heading_${level}` as BlockType;
      const blocks = convertContainer(element, ctx, inherit, depth, type);
      return blocks.length ? blocks : [{ id: blockId(), type, richText: [] }];
    }
    case "p": {
      const documentHeading = documentHeadingType(element);
      const type = documentHeading ?? "paragraph";
      const blocks = convertContainer(element, ctx, inherit, depth, type);
      if (blocks.length) return blocks;
      const props = textBlockProps(element, type, ctx, inherit);
      return [{ id: blockId(), type, richText: [], ...(props ? { props } : {}) }];
    }
    case "hr":
      return [{ id: blockId(), type: "divider" }];
    case "pre": {
      const text = rawText(element).replace(/\s+$/, "");
      return [
        {
          id: blockId(),
          type: "code",
          richText: text ? [{ text }] : [],
          props: { language: codeLanguageOf(element) },
        },
      ];
    }
    case "blockquote": {
      const blocks = hasBlockChild(element)
        ? convertChildren(element, ctx, inherit, depth + 1)
        : convertContainer(element, ctx, inherit, depth, "quote");
      if (!blocks.length) return [{ id: blockId(), type: "quote", richText: [] }];
      return blocks.map((block) =>
        block.type === "paragraph" ? { ...block, type: "quote" as BlockType } : block
      );
    }
    case "ul":
    case "ol":
    case "menu":
      return convertList(element, ctx, inherit, depth);
    case "li":
      return convertList(
        { type: "element", name: "ul", attrs: {}, children: [element] },
        ctx,
        inherit,
        depth
      );
    case "dl": {
      const out: AppBlock[] = [];
      for (const child of childElements(element)) {
        if (child.name === "dt") {
          for (const block of convertContainer(child, ctx, inherit, depth + 1)) {
            out.push(
              block.type === "paragraph"
                ? {
                    ...block,
                    richText: (block.richText ?? []).map((span) => ({
                      ...span,
                      annotations: { ...(span.annotations ?? {}), bold: true },
                    })),
                  }
                : block
            );
          }
          continue;
        }
        if (child.name === "dd") {
          for (const block of convertContainer(child, ctx, inherit, depth + 1)) {
            out.push({ ...block, props: { ...(block.props ?? {}), indent: 1 } });
          }
        }
      }
      return out;
    }
    case "table":
      return [convertTable(element, ctx, inherit, depth)];
    case "details": {
      const summary = childElements(element, "summary")[0];
      const header = summary ? convertContainer(summary, ctx, inherit, depth + 1) : [];
      const body: AppBlock[] = [];
      for (const child of element.children) {
        if (!isElement(child) || child.name === "summary") continue;
        body.push(...convertBlockElement(child, ctx, inherit, depth + 1));
      }
      return [
        {
          id: blockId(),
          type: "toggle",
          richText: header[0]?.richText ?? [],
          props: { open: element.attrs.open !== undefined },
          ...(body.length ? { children: body } : {}),
        },
      ];
    }
    case "iframe":
    case "embed":
    case "object": {
      const url = normalizeHref(attr(element, "src") ?? attr(element, "data"));
      if (!url) return [];
      return [{ id: blockId(), type: "embed", props: { url, title: attr(element, "title") || url } }];
    }
    case "video":
    case "audio": {
      const resolved = ctx.resolveMedia?.(element);
      if (resolved) return [mediaBlock(resolved)];
      const source = attr(element, "src") ?? attr(childElements(element, "source")[0] ?? element, "src");
      if (!source) return [];
      return [
        mediaBlock({
          url: source,
          name: guessNameFromUrl(source, name),
          kind: name === "video" ? "video" : "audio",
        }),
      ];
    }
    case "figure": {
      const out: AppBlock[] = [];
      for (const child of element.children) {
        if (!isElement(child)) continue;
        if (child.name === "figcaption") {
          out.push(...convertContainer(child, ctx, inherit, depth + 1));
          continue;
        }
        out.push(...convertBlockElement(child, ctx, inherit, depth + 1));
      }
      return out;
    }
    case "center": {
      const centered: InheritedStyle = { ...inheritFrom(element, ctx, inherit), textAlign: "center" };
      return hasBlockChild(element)
        ? convertChildren(element, ctx, centered, depth + 1)
        : convertContainer(element, ctx, centered, depth, "paragraph");
    }
    case "br":
      return [];
    default:
      break;
  }

  if (TRANSPARENT_TAGS.has(name)) return convertChildren(element, ctx, inherit, depth + 1);
  if (hasBlockChild(element)) return convertChildren(element, ctx, inherit, depth + 1);
  return convertContainer(element, ctx, inherit, depth, "paragraph");
}

function collectStyleRules(root: ParsedElement): StyleRule[] {
  const rules: StyleRule[] = [];
  for (const style of findDescendants(root, "style")) {
    rules.push(...parseStyleSheet(textContent(style)));
  }
  return rules;
}

function isEmptyParagraph(block: AppBlock): boolean {
  return (
    block.type === "paragraph" &&
    !block.children?.length &&
    !block.media &&
    !spansPlainText(block.richText).trim()
  );
}

function snapSpans(spans: RichTextSpan[] | undefined): RichTextSpan[] | undefined {
  if (!spans?.length) return spans;
  return spans.map((span) => {
    const annotations = span.annotations;
    if (!annotations?.color && typeof annotations?.highlight !== "string") return span;
    const next: RichTextAnnotations = { ...annotations };
    if (annotations.color) {
      const snapped = snapTextColor(annotations.color);
      if (snapped) next.color = snapped;
      else delete next.color;
    }
    if (typeof annotations.highlight === "string") {
      const snapped = snapHighlightColor(annotations.highlight);
      next.highlight = snapped ?? true;
    }
    return { ...span, annotations: next };
  });
}

export function normalizeBlocks(blocks: AppBlock[]): AppBlock[] {
  const out: AppBlock[] = [];
  for (const block of blocks) {
    const next: AppBlock = { ...block };
    const children = block.children?.length ? normalizeBlocks(block.children) : [];
    if (children.length) next.children = children;
    else delete next.children;
    if (next.richText?.length) next.richText = snapSpans(next.richText);
    if (next.props?.tableRows?.length) {
      next.props = {
        ...next.props,
        tableRows: next.props.tableRows.map((row) => ({
          cells: row.cells.map((cell) => ({ ...cell, spans: snapSpans(cell.spans) ?? [] })),
        })),
      };
    }
    out.push(next);
  }
  while (out.length && isEmptyParagraph(out[out.length - 1])) out.pop();
  while (out.length && isEmptyParagraph(out[0])) out.shift();
  return out;
}

export function htmlToBlocks(root: ParsedElement, options: HtmlConvertOptions = {}): AppBlock[] {
  const rules = [...collectStyleRules(root), ...(options.extraStyleRules ?? [])];
  const ctx: ConvertContext = {
    resolveStyle: createStyleResolver(rules),
    resolveMedia: options.resolveMedia,
    warn: (code) => options.onWarning?.(code),
  };
  return normalizeBlocks(convertChildren(root, ctx, { annotations: {} }, 0));
}

export function firstHeadingText(blocks: AppBlock[]): string {
  for (const block of blocks) {
    if (block.type === "heading_1" || block.type === "heading_2" || block.type === "heading_3") {
      const text = spansPlainText(block.richText).trim();
      if (text) return text;
    }
  }
  return "";
}
