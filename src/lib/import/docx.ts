import { nanoid } from "nanoid";
import type { AppBlock, BlockType, RichTextAnnotations, RichTextSpan, TableCell, TableRow } from "@/types/models";
import { isElement, parseMarkup, textContent, type ParsedElement } from "./dom";
import { extensionForMime, mimeFromName, sanitizeFileName } from "./binary";
import { readZip, resolveZipPath, zipText, type ZipEntries } from "./zip";
import { normalizeBlocks, normalizeHref, spansPlainText, type TextAlignValue } from "./html-blocks";
import { assetUrl, ImportError, type ImportedAsset, type ImportedNote, type ImportWarningCode } from "./types";

const TWIPS_PER_PIXEL = 15;
const EMU_PER_PIXEL = 9525;
const INDENT_TWIPS = 720;
const MAX_INDENT = 8;

const HIGHLIGHT_BY_NAME: Record<string, string> = {
  yellow: "#FFFF00",
  green: "#00FF00",
  cyan: "#00FFFF",
  magenta: "#FF00FF",
  blue: "#0000FF",
  red: "#FF0000",
  darkBlue: "#000080",
  darkCyan: "#008080",
  darkGreen: "#008000",
  darkMagenta: "#800080",
  darkRed: "#800000",
  darkYellow: "#808000",
  darkGray: "#808080",
  lightGray: "#C0C0C0",
};

const MONOSPACE_PATTERN = /courier|consolas|monaco|menlo|monospace|lucida console|roboto mono|source code/i;

const CHECKBOX_EMPTY = new Set(["F06F", "F0A8", "F071", "F0A3", "2610", "25A1", "2751"]);
const CHECKBOX_CHECKED = new Set(["F0FE", "F0FC", "F0FD", "F0A5", "2611", "2612", "2705"]);

const SYMBOL_BY_CHAR: Record<string, string> = {
  F0B7: "•",
  F0A7: "▪",
  F06E: "■",
  F075: "◆",
  F0D8: "➢",
  F0E0: "➔",
};

function localName(name: string): string {
  const index = name.indexOf(":");
  return index === -1 ? name : name.slice(index + 1);
}

function childrenNamed(element: ParsedElement, name: string): ParsedElement[] {
  const out: ParsedElement[] = [];
  for (const child of element.children) {
    if (isElement(child) && localName(child.name) === name) out.push(child);
  }
  return out;
}

function childNamed(element: ParsedElement | null, name: string): ParsedElement | null {
  if (!element) return null;
  for (const child of element.children) {
    if (isElement(child) && localName(child.name) === name) return child;
  }
  return null;
}

function descendantNamed(element: ParsedElement | null, name: string): ParsedElement | null {
  if (!element) return null;
  for (const child of element.children) {
    if (!isElement(child)) continue;
    if (localName(child.name) === name) return child;
    const nested = descendantNamed(child, name);
    if (nested) return nested;
  }
  return null;
}

function descendantsNamed(element: ParsedElement, name: string): ParsedElement[] {
  const out: ParsedElement[] = [];
  const walk = (node: ParsedElement) => {
    for (const child of node.children) {
      if (!isElement(child)) continue;
      if (localName(child.name) === name) out.push(child);
      walk(child);
    }
  };
  walk(element);
  return out;
}

function attrValue(element: ParsedElement | null, name: string): string | undefined {
  if (!element) return undefined;
  const direct = element.attrs[`w:${name}`];
  if (direct !== undefined) return direct;
  for (const [key, value] of Object.entries(element.attrs)) {
    if (localName(key) === name) return value;
  }
  return undefined;
}

function childVal(parent: ParsedElement | null, name: string): string | undefined {
  return attrValue(childNamed(parent, name), "val");
}

function isToggleOn(element: ParsedElement | null): boolean {
  if (!element) return false;
  const value = attrValue(element, "val");
  if (value === undefined) return true;
  return value !== "0" && value !== "false" && value !== "off";
}

function numberValue(raw: string | undefined | null): number | null {
  if (raw === undefined || raw === null) return null;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : null;
}

const COMBINING_MARKS = new RegExp("[\u0300-\u036f]", "g");

function normalizeStyleName(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function codePointHex(text: string): string {
  if (!text) return "";
  const code = text.codePointAt(0);
  return code === undefined ? "" : code.toString(16).toUpperCase().padStart(4, "0");
}

interface DocxStyle {
  id: string;
  name: string;
  type: string;
  basedOn: string | null;
  pPr: ParsedElement | null;
  rPr: ParsedElement | null;
}

interface ParagraphFormat {
  align?: TextAlignValue;
  indentTwips?: number;
  firstLineTwips?: number;
  numId?: string;
  ilvl?: number;
  outlineLevel?: number;
  pageBreakBefore?: boolean;
}

interface NumberingLevel {
  format: string;
  levelText: string;
}

interface DocxContext {
  entries: ZipEntries;
  rels: Map<string, { target: string; external: boolean }>;
  styles: Map<string, DocxStyle>;
  numbering: Map<string, Map<number, NumberingLevel>>;
  assets: ImportedAsset[];
  assetByPath: Map<string, ImportedAsset>;
  defaultAnnotations: RichTextAnnotations;
  warn: (code: ImportWarningCode) => void;
}

function readRelationships(entries: ZipEntries): Map<string, { target: string; external: boolean }> {
  const map = new Map<string, { target: string; external: boolean }>();
  const xml = zipText(entries, "word/_rels/document.xml.rels");
  if (!xml) return map;
  const root = parseMarkup(xml, { xml: true });
  for (const relationship of descendantsNamed(root, "Relationship")) {
    const id = relationship.attrs.Id ?? relationship.attrs.id;
    const target = relationship.attrs.Target ?? relationship.attrs.target;
    if (!id || !target) continue;
    const mode = relationship.attrs.TargetMode ?? relationship.attrs.targetmode ?? "";
    map.set(id, { target, external: mode.toLowerCase() === "external" });
  }
  return map;
}

function readStyles(entries: ZipEntries): { styles: Map<string, DocxStyle>; defaults: ParsedElement | null } {
  const styles = new Map<string, DocxStyle>();
  const xml = zipText(entries, "word/styles.xml");
  if (!xml) return { styles, defaults: null };
  const root = parseMarkup(xml, { xml: true });

  for (const style of descendantsNamed(root, "style")) {
    const id = attrValue(style, "styleId");
    if (!id) continue;
    styles.set(id, {
      id,
      name: childVal(style, "name") ?? id,
      type: attrValue(style, "type") ?? "paragraph",
      basedOn: childVal(style, "basedOn") ?? null,
      pPr: childNamed(style, "pPr"),
      rPr: childNamed(style, "rPr"),
    });
  }

  const docDefaults = descendantNamed(root, "docDefaults");
  return { styles, defaults: descendantNamed(docDefaults, "rPr") };
}

function readLevel(level: ParsedElement): NumberingLevel {
  return {
    format: childVal(level, "numFmt") ?? "decimal",
    levelText: childVal(level, "lvlText") ?? "",
  };
}

function readNumbering(entries: ZipEntries): Map<string, Map<number, NumberingLevel>> {
  const result = new Map<string, Map<number, NumberingLevel>>();
  const xml = zipText(entries, "word/numbering.xml");
  if (!xml) return result;
  const root = parseMarkup(xml, { xml: true });

  const abstracts = new Map<string, Map<number, NumberingLevel>>();
  for (const abstract of descendantsNamed(root, "abstractNum")) {
    const id = attrValue(abstract, "abstractNumId");
    if (!id) continue;
    const levels = new Map<number, NumberingLevel>();
    for (const level of childrenNamed(abstract, "lvl")) {
      levels.set(numberValue(attrValue(level, "ilvl")) ?? 0, readLevel(level));
    }
    abstracts.set(id, levels);
  }

  for (const num of descendantsNamed(root, "num")) {
    const numId = attrValue(num, "numId");
    const abstractId = childVal(num, "abstractNumId");
    if (!numId || !abstractId) continue;
    const base = abstracts.get(abstractId);
    const levels = new Map(base ?? []);
    for (const override of childrenNamed(num, "lvlOverride")) {
      const level = childNamed(override, "lvl");
      if (!level) continue;
      levels.set(numberValue(attrValue(override, "ilvl")) ?? 0, readLevel(level));
    }
    result.set(numId, levels);
  }

  return result;
}

function styleChain(ctx: DocxContext, styleId: string | null | undefined): DocxStyle[] {
  const chain: DocxStyle[] = [];
  const seen = new Set<string>();
  let current = styleId ? ctx.styles.get(styleId) : undefined;
  while (current && !seen.has(current.id) && chain.length < 16) {
    seen.add(current.id);
    chain.unshift(current);
    current = current.basedOn ? ctx.styles.get(current.basedOn) : undefined;
  }
  return chain;
}

function annotationsFromRPr(rPr: ParsedElement | null, base: RichTextAnnotations): RichTextAnnotations {
  if (!rPr) return { ...base };
  const next: RichTextAnnotations = { ...base };

  const bold = childNamed(rPr, "b");
  if (bold) next.bold = isToggleOn(bold);
  const italic = childNamed(rPr, "i");
  if (italic) next.italic = isToggleOn(italic);

  const underline = childNamed(rPr, "u");
  if (underline) {
    const value = attrValue(underline, "val");
    next.underline = value !== "none" && value !== "0" && value !== "false";
  }

  const strike = childNamed(rPr, "strike");
  if (strike) next.strikethrough = isToggleOn(strike);
  const doubleStrike = childNamed(rPr, "dstrike");
  if (doubleStrike) next.strikethrough = isToggleOn(doubleStrike);

  const color = childVal(rPr, "color");
  if (color && color !== "auto") {
    const hex = `#${color.replace("#", "").toUpperCase()}`;
    if (/^#[0-9A-F]{6}$/.test(hex)) {
      if (hex === "#000000" || hex === "#FFFFFF") delete next.color;
      else next.color = hex;
    }
  }

  const highlight = childVal(rPr, "highlight");
  if (highlight) {
    if (highlight === "none") delete next.highlight;
    else next.highlight = HIGHLIGHT_BY_NAME[highlight] ?? true;
  }

  const shading = childNamed(rPr, "shd");
  if (shading) {
    const fill = attrValue(shading, "fill");
    if (fill && fill !== "auto" && fill.toUpperCase() !== "FFFFFF") {
      const hex = `#${fill.replace("#", "").toUpperCase()}`;
      if (/^#[0-9A-F]{6}$/.test(hex)) next.highlight = hex;
    }
  }

  const fonts = childNamed(rPr, "rFonts");
  if (fonts) {
    const ascii = attrValue(fonts, "ascii") ?? attrValue(fonts, "hAnsi") ?? "";
    if (ascii && MONOSPACE_PATTERN.test(ascii)) next.code = true;
  }

  return next;
}

function paragraphFormatFrom(pPr: ParsedElement | null, base: ParagraphFormat): ParagraphFormat {
  if (!pPr) return { ...base };
  const next: ParagraphFormat = { ...base };

  const jc = childVal(pPr, "jc");
  if (jc === "center") next.align = "center";
  else if (jc === "right" || jc === "end") next.align = "right";
  else if (jc === "both" || jc === "distribute") next.align = "justify";
  else if (jc === "left" || jc === "start") next.align = "left";

  const ind = childNamed(pPr, "ind");
  if (ind) {
    const left = numberValue(attrValue(ind, "left") ?? attrValue(ind, "start"));
    if (left !== null) next.indentTwips = left;
    const firstLine = numberValue(attrValue(ind, "firstLine"));
    if (firstLine !== null) next.firstLineTwips = firstLine;
    const hanging = numberValue(attrValue(ind, "hanging"));
    if (hanging !== null && hanging > 0) next.firstLineTwips = 0;
  }

  const numPr = childNamed(pPr, "numPr");
  if (numPr) {
    const numId = childVal(numPr, "numId");
    const ilvl = numberValue(childVal(numPr, "ilvl"));
    if (numId !== undefined) next.numId = numId;
    if (ilvl !== null) next.ilvl = ilvl;
  }

  const outline = numberValue(childVal(pPr, "outlineLvl"));
  if (outline !== null) next.outlineLevel = outline;

  const pageBreak = childNamed(pPr, "pageBreakBefore");
  if (pageBreak) next.pageBreakBefore = isToggleOn(pageBreak);

  return next;
}

interface ParagraphStyleInfo {
  headingLevel: 1 | 2 | 3 | null;
  quote: boolean;
  code: boolean;
  format: ParagraphFormat;
  annotations: RichTextAnnotations;
}

function headingLevelFromName(name: string, styleId: string): number | null {
  const normalized = normalizeStyleName(name);
  const direct =
    /^(?:heading|titulo|ttulo|title|titre|titolo|uberschrift|berschrift|encabezado|rubrik|zagolovok)\s*([1-9])$/.exec(
      normalized
    );
  if (direct) return Number(direct[1]);
  const byId = /^(?:Heading|Ttulo|Titulo|Title|Titre|Titolo|berschrift|Uberschrift)([1-9])$/.exec(styleId);
  if (byId) return Number(byId[1]);
  if (normalized === "title" || normalized === "titulo" || normalized === "ttulo") return 1;
  if (normalized === "subtitle" || normalized === "subtitulo" || normalized === "subttulo") return 2;
  return null;
}

function paragraphStyleInfo(ctx: DocxContext, styleId: string | null | undefined): ParagraphStyleInfo {
  const chain = styleChain(ctx, styleId);
  let format: ParagraphFormat = {};
  let annotations: RichTextAnnotations = { ...ctx.defaultAnnotations };
  let headingLevel: number | null = null;
  let quote = false;
  let code = false;

  for (const style of chain) {
    format = paragraphFormatFrom(style.pPr, format);
    annotations = annotationsFromRPr(style.rPr, annotations);
    const level = headingLevelFromName(style.name, style.id);
    if (level !== null) headingLevel = level;
    const normalized = normalizeStyleName(style.name);
    if (/(^|\s)(quote|citacao|citazione|zitat|citation|cita)(\s|$)/.test(normalized)) quote = true;
    if (/(code|preformatted|source|codigo|plain text)/.test(normalized)) code = true;
  }

  if (headingLevel === null && format.outlineLevel !== undefined && format.outlineLevel <= 2) {
    headingLevel = format.outlineLevel + 1;
  }

  return {
    headingLevel: headingLevel === null ? null : (Math.min(3, Math.max(1, headingLevel)) as 1 | 2 | 3),
    quote,
    code,
    format,
    annotations,
  };
}

function assetForRelationship(ctx: DocxContext, relationshipId: string | undefined): ImportedAsset | null {
  if (!relationshipId) return null;
  const relationship = ctx.rels.get(relationshipId);
  if (!relationship || relationship.external) return null;

  const path = resolveZipPath("word/document.xml", relationship.target);
  const cached = ctx.assetByPath.get(path);
  if (cached) return cached;

  const bytes = ctx.entries[path];
  if (!bytes) {
    ctx.warn("missing_asset");
    return null;
  }

  const baseName = path.split("/").pop() ?? "imagem";
  const mimeType = mimeFromName(baseName, "image/png");
  const asset: ImportedAsset = {
    id: `docx_${nanoid(10)}`,
    name: sanitizeFileName(baseName.includes(".") ? baseName : `${baseName}.${extensionForMime(mimeType)}`),
    mimeType,
    bytes,
  };
  ctx.assets.push(asset);
  ctx.assetByPath.set(path, asset);
  return asset;
}

function mediaBlockFromAsset(asset: ImportedAsset, label: string, width?: number, height?: number): AppBlock {
  return {
    id: `blk_${nanoid(8)}`,
    type: asset.mimeType.startsWith("image/") ? "image" : "file",
    media: {
      url: assetUrl(asset.id),
      name: sanitizeFileName(label || asset.name),
      mimeType: asset.mimeType,
      sizeBytes: asset.bytes.length,
      ...(width ? { width } : {}),
      ...(height ? { height } : {}),
      pending: false,
    },
  };
}

function imageBlockFromDrawing(element: ParsedElement, ctx: DocxContext): AppBlock | null {
  const blip = descendantNamed(element, "blip");
  if (!blip) return null;
  const relationshipId = attrValue(blip, "embed") ?? attrValue(blip, "link");
  const asset = assetForRelationship(ctx, relationshipId);
  if (!asset) {
    ctx.warn("missing_asset");
    return null;
  }

  const extent = descendantNamed(element, "extent");
  const cx = numberValue(extent?.attrs.cx);
  const cy = numberValue(extent?.attrs.cy);
  const docPr = descendantNamed(element, "docPr");
  const label = docPr?.attrs.descr || docPr?.attrs.name || asset.name;

  return mediaBlockFromAsset(
    asset,
    label,
    cx ? Math.round(cx / EMU_PER_PIXEL) : undefined,
    cy ? Math.round(cy / EMU_PER_PIXEL) : undefined
  );
}

function graphicBlock(element: ParsedElement, ctx: DocxContext): AppBlock | null {
  const name = localName(element.name);
  if (name === "AlternateContent") {
    const branch = childNamed(element, "Choice") ?? childNamed(element, "Fallback");
    return branch ? graphicBlock(branch, ctx) : null;
  }
  const drawing = name === "drawing" ? element : descendantNamed(element, "drawing");
  const fromDrawing = drawing ? imageBlockFromDrawing(drawing, ctx) : null;
  if (fromDrawing) return fromDrawing;
  const pict = name === "pict" ? element : descendantNamed(element, "pict");
  return pict ? imageBlockFromPict(pict, ctx) : imageBlockFromPict(element, ctx);
}

function imageBlockFromPict(element: ParsedElement, ctx: DocxContext): AppBlock | null {
  const imageData = descendantNamed(element, "imagedata");
  if (!imageData) return null;
  const asset = assetForRelationship(ctx, attrValue(imageData, "id"));
  if (!asset) return null;
  return mediaBlockFromAsset(asset, asset.name);
}

interface RunSink {
  spans: RichTextSpan[];
  blocks: AppBlock[];
  flush: () => void;
}

function pushSpan(sink: RunSink, text: string, annotations: RichTextAnnotations, href?: string) {
  if (!text) return;
  const clean: RichTextAnnotations = {};
  if (annotations.bold) clean.bold = true;
  if (annotations.italic) clean.italic = true;
  if (annotations.underline) clean.underline = true;
  if (annotations.strikethrough) clean.strikethrough = true;
  if (annotations.code) clean.code = true;
  if (annotations.color) clean.color = annotations.color;
  if (annotations.highlight) clean.highlight = annotations.highlight;
  const hasAnnotations = Object.keys(clean).length > 0;

  const last = sink.spans[sink.spans.length - 1];
  if (
    last &&
    (last.href ?? "") === (href ?? "") &&
    JSON.stringify(last.annotations ?? {}) === JSON.stringify(hasAnnotations ? clean : {})
  ) {
    sink.spans[sink.spans.length - 1] = { ...last, text: last.text + text };
    return;
  }
  sink.spans.push({
    text,
    ...(hasAnnotations ? { annotations: clean } : {}),
    ...(href ? { href } : {}),
  });
}

function hyperlinkFromInstruction(instruction: string): string | undefined {
  const match = /HYPERLINK\s+"([^"]+)"/i.exec(instruction) ?? /HYPERLINK\s+(\S+)/i.exec(instruction);
  return match ? normalizeHref(match[1]) : undefined;
}

interface FieldState {
  mode: "none" | "instruction";
  instruction: string;
  href?: string;
}

function convertRun(
  run: ParsedElement,
  ctx: DocxContext,
  baseAnnotations: RichTextAnnotations,
  href: string | undefined,
  sink: RunSink,
  fieldState: FieldState
) {
  const rPr = childNamed(run, "rPr");
  const runStyleId = childVal(rPr, "rStyle");
  let annotations = baseAnnotations;
  if (runStyleId) {
    for (const style of styleChain(ctx, runStyleId)) {
      annotations = annotationsFromRPr(style.rPr, annotations);
    }
  }
  annotations = annotationsFromRPr(rPr, annotations);
  const effectiveHref = href ?? fieldState.href;

  for (const child of run.children) {
    if (!isElement(child)) continue;
    const name = localName(child.name);

    switch (name) {
      case "t":
        if (fieldState.mode !== "instruction") pushSpan(sink, textContent(child), annotations, effectiveHref);
        break;
      case "delText":
        break;
      case "instrText":
        fieldState.instruction += textContent(child);
        break;
      case "fldChar": {
        const type = attrValue(child, "fldCharType");
        if (type === "begin") {
          fieldState.mode = "instruction";
          fieldState.instruction = "";
          fieldState.href = undefined;
        } else if (type === "separate") {
          fieldState.mode = "none";
          fieldState.href = hyperlinkFromInstruction(fieldState.instruction);
        } else if (type === "end") {
          fieldState.mode = "none";
          fieldState.instruction = "";
          fieldState.href = undefined;
        }
        break;
      }
      case "tab":
        pushSpan(sink, "\t", annotations, effectiveHref);
        break;
      case "cr":
        pushSpan(sink, "\n", annotations, effectiveHref);
        break;
      case "br": {
        const type = attrValue(child, "type");
        if (type === "page" || type === "column") {
          sink.flush();
          sink.blocks.push({ id: `blk_${nanoid(8)}`, type: "divider" });
        } else {
          pushSpan(sink, "\n", annotations, effectiveHref);
        }
        break;
      }
      case "noBreakHyphen":
        pushSpan(sink, "-", annotations, effectiveHref);
        break;
      case "sym": {
        const mapped = SYMBOL_BY_CHAR[(attrValue(child, "char") ?? "").toUpperCase()];
        if (mapped) pushSpan(sink, mapped, annotations, effectiveHref);
        break;
      }
      case "AlternateContent":
      case "drawing":
      case "pict":
      case "object": {
        const block = graphicBlock(child, ctx);
        if (block) {
          sink.flush();
          sink.blocks.push(block);
          break;
        }
        const salvage = descendantsNamed(child, "t").map((node) => textContent(node)).join("");
        if (salvage.trim()) pushSpan(sink, salvage, annotations, effectiveHref);
        break;
      }
      default:
        break;
    }
  }
}

function hyperlinkTarget(element: ParsedElement, ctx: DocxContext): string | undefined {
  const relationshipId = element.attrs["r:id"] ?? attrValue(element, "id");
  if (!relationshipId) return undefined;
  const relationship = ctx.rels.get(relationshipId);
  return relationship ? normalizeHref(relationship.target) : undefined;
}

function indentLevel(format: ParagraphFormat): number {
  const twips = format.indentTwips ?? 0;
  if (twips < INDENT_TWIPS * 0.6) return 0;
  return Math.min(MAX_INDENT, Math.max(1, Math.round(twips / INDENT_TWIPS)));
}

function listTypeFor(ctx: DocxContext, format: ParagraphFormat): { type: BlockType; checked?: boolean } | null {
  if (!format.numId || format.numId === "0") return null;
  const level = ctx.numbering.get(format.numId)?.get(format.ilvl ?? 0);
  if (!level) return { type: "bulleted_list_item" };
  if (level.format === "none") return null;
  if (level.format !== "bullet") return { type: "numbered_list_item" };

  const hex = codePointHex(level.levelText);
  if (CHECKBOX_CHECKED.has(hex)) return { type: "todo", checked: true };
  if (CHECKBOX_EMPTY.has(hex)) return { type: "todo", checked: false };
  return { type: "bulleted_list_item" };
}

function convertParagraph(paragraph: ParsedElement, ctx: DocxContext): AppBlock[] {
  const pPr = childNamed(paragraph, "pPr");
  const styleId = childVal(pPr, "pStyle");
  const info = paragraphStyleInfo(ctx, styleId);
  const format = paragraphFormatFrom(pPr, info.format);

  const blocks: AppBlock[] = [];
  const sink: RunSink = {
    spans: [],
    blocks,
    flush: () => {
      const spans = sink.spans;
      sink.spans = [];
      if (!spans.length) return;
      blocks.push({ id: `blk_${nanoid(8)}`, type: "paragraph", richText: spans });
    },
  };

  const fieldState: FieldState = { mode: "none", instruction: "" };

  const walk = (node: ParsedElement, href: string | undefined) => {
    for (const child of node.children) {
      if (!isElement(child)) continue;
      const name = localName(child.name);
      if (name === "pPr" || name === "bookmarkStart" || name === "bookmarkEnd" || name === "proofErr") continue;
      if (name === "del" || name === "moveFrom") continue;
      if (name === "r") {
        convertRun(child, ctx, info.annotations, href, sink, fieldState);
        continue;
      }
      if (name === "hyperlink") {
        walk(child, hyperlinkTarget(child, ctx) ?? href);
        continue;
      }
      if (name === "fldSimple") {
        walk(child, hyperlinkFromInstruction(attrValue(child, "instr") ?? "") ?? href);
        continue;
      }
      if (name === "sdt") {
        const content = childNamed(child, "sdtContent");
        if (content) walk(content, href);
        continue;
      }
      if (name === "drawing" || name === "pict" || name === "AlternateContent") {
        const block = graphicBlock(child, ctx);
        if (block) {
          sink.flush();
          blocks.push(block);
          continue;
        }
      }
      walk(child, href);
    }
  };

  if (format.pageBreakBefore) blocks.push({ id: `blk_${nanoid(8)}`, type: "divider" });
  walk(paragraph, undefined);
  sink.flush();

  const list = listTypeFor(ctx, format);
  const indent = list ? 0 : indentLevel(format);
  const align = format.align ?? "left";
  const firstLine = (format.firstLineTwips ?? 0) / TWIPS_PER_PIXEL;

  if (!blocks.length) {
    const props: NonNullable<AppBlock["props"]> = { textAlign: align };
    if (indent > 0) props.indent = indent;
    if (firstLine > 4) props.indentFirst = true;
    return [{ id: `blk_${nanoid(8)}`, type: "paragraph", richText: [], props }];
  }

  return blocks.map((block) => {
    if (block.type !== "paragraph") return block;

    if (list) {
      return {
        ...block,
        type: list.type,
        ...(list.type === "todo" ? { props: { checked: Boolean(list.checked) } } : {}),
      };
    }

    if (info.code) {
      return {
        ...block,
        type: "code" as BlockType,
        richText: [{ text: spansPlainText(block.richText) }],
        props: { language: "plaintext" },
      };
    }

    const type: BlockType = info.headingLevel
      ? (`heading_${info.headingLevel}` as BlockType)
      : info.quote
        ? "quote"
        : "paragraph";

    const props: NonNullable<AppBlock["props"]> = {};
    if (type === "paragraph" || type === "quote") props.textAlign = align;
    else if (align !== "left") props.textAlign = align;
    if (indent > 0) props.indent = indent;
    if (firstLine > 4 && type === "paragraph") props.indentFirst = true;

    return { ...block, type, ...(Object.keys(props).length ? { props } : {}) };
  });
}

function cellParagraphsToSpans(cell: ParsedElement, ctx: DocxContext, depth = 0): RichTextSpan[] {
  const spans: RichTextSpan[] = [];
  for (const child of cell.children) {
    if (!isElement(child)) continue;
    const name = localName(child.name);

    if (name === "p") {
      for (const block of convertParagraph(child, ctx)) {
        const text = block.richText ?? [];
        const content = text.length ? text : block.media?.name ? [{ text: block.media.name }] : [];
        if (!content.length) continue;
        if (spans.length) spans.push({ text: "\n" });
        spans.push(...content);
      }
      continue;
    }

    if (name === "tbl" && depth < 3) {
      ctx.warn("nested_table");
      for (const row of childrenNamed(child, "tr")) {
        if (spans.length) spans.push({ text: "\n" });
        childrenNamed(row, "tc").forEach((nested, index) => {
          if (index > 0) spans.push({ text: " | " });
          spans.push(...cellParagraphsToSpans(nested, ctx, depth + 1));
        });
      }
    }
  }
  return spans;
}

function convertTable(table: ParsedElement, ctx: DocxContext): AppBlock {
  const rows: TableRow[] = [];
  let hasColumnHeader = false;

  for (const row of childrenNamed(table, "tr")) {
    const trPr = childNamed(row, "trPr");
    if (childNamed(trPr, "tblHeader")) hasColumnHeader = true;

    const cells: TableCell[] = [];
    for (const cell of childrenNamed(row, "tc")) {
      const tcPr = childNamed(cell, "tcPr");
      const gridSpan = numberValue(childVal(tcPr, "gridSpan")) ?? 1;
      const vAlign = childVal(tcPr, "vAlign");
      const firstParagraph = childNamed(cell, "p");
      const jc = childVal(childNamed(firstParagraph, "pPr"), "jc");

      const horizontal = jc === "center" ? "center" : jc === "right" || jc === "end" ? "right" : undefined;
      const vertical =
        vAlign === "center" ? "middle" : vAlign === "bottom" ? "bottom" : vAlign === "top" ? "top" : undefined;

      cells.push({
        spans: cellParagraphsToSpans(cell, ctx),
        ...(horizontal ? { horizontalAlign: horizontal } : {}),
        ...(vertical ? { verticalAlign: vertical } : {}),
      });
      for (let index = 1; index < Math.min(32, Math.max(1, gridSpan)); index += 1) {
        cells.push({ spans: [] });
      }
    }
    rows.push({ cells });
  }

  const columnCount = rows.reduce((max, row) => Math.max(max, row.cells.length), 0);
  const normalized = rows.map((row) => ({
    cells: Array.from({ length: columnCount }, (_, index) => row.cells[index] ?? { spans: [] }),
  }));

  const grid = childNamed(table, "tblGrid");
  const colWidths = grid
    ? childrenNamed(grid, "gridCol").map((column) => {
        const width = numberValue(attrValue(column, "w")) ?? 0;
        return width > 0 ? Math.round(width / TWIPS_PER_PIXEL) : 0;
      })
    : [];

  return {
    id: `blk_${nanoid(8)}`,
    type: "table",
    props: {
      hasColumnHeader,
      tableRows: normalized,
      ...(colWidths.some((width) => width > 0) ? { colWidths } : {}),
    },
  };
}

function nestListBlocks(blocks: AppBlock[], levels: number[]): AppBlock[] {
  const out: AppBlock[] = [];
  const stack: { level: number; block: AppBlock }[] = [];

  blocks.forEach((block, index) => {
    const level = levels[index] ?? -1;
    if (level < 0) {
      stack.length = 0;
      out.push(block);
      return;
    }
    while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
    const parent = stack[stack.length - 1];
    if (parent) parent.block.children = [...(parent.block.children ?? []), block];
    else out.push(block);
    stack.push({ level, block });
  });

  return out;
}

function mergeCodeBlocks(blocks: AppBlock[]): AppBlock[] {
  const out: AppBlock[] = [];
  for (const block of blocks) {
    const previous = out[out.length - 1];
    if (block.type === "code" && previous?.type === "code") {
      out[out.length - 1] = {
        ...previous,
        richText: [{ text: `${spansPlainText(previous.richText)}\n${spansPlainText(block.richText)}` }],
      };
      continue;
    }
    out.push(block);
  }
  return out;
}

function convertBody(body: ParsedElement, ctx: DocxContext): AppBlock[] {
  const blocks: AppBlock[] = [];
  const levels: number[] = [];

  const walk = (node: ParsedElement) => {
    for (const child of node.children) {
      if (!isElement(child)) continue;
      const name = localName(child.name);

      if (name === "p") {
        const pPr = childNamed(child, "pPr");
        const info = paragraphStyleInfo(ctx, childVal(pPr, "pStyle"));
        const format = paragraphFormatFrom(pPr, info.format);
        const list = listTypeFor(ctx, format);
        for (const block of convertParagraph(child, ctx)) {
          blocks.push(block);
          const isListBlock =
            block.type === "bulleted_list_item" || block.type === "numbered_list_item" || block.type === "todo";
          levels.push(list && isListBlock ? Math.min(8, format.ilvl ?? 0) : -1);
        }
        continue;
      }
      if (name === "tbl") {
        blocks.push(convertTable(child, ctx));
        levels.push(-1);
        continue;
      }
      if (name === "sdt") {
        const content = childNamed(child, "sdtContent");
        if (content) walk(content);
      }
    }
  };

  walk(body);
  return mergeCodeBlocks(nestListBlocks(blocks, levels));
}

function documentTitle(entries: ZipEntries): string {
  const xml = zipText(entries, "docProps/core.xml");
  if (!xml) return "";
  const root = parseMarkup(xml, { xml: true });
  const title = descendantNamed(root, "title");
  return title ? textContent(title).trim() : "";
}

export function parseDocx(
  bytes: Uint8Array,
  sourceFileName: string,
  source: "docx" | "google-docs" = "docx"
): ImportedNote {
  const entries = readZip(bytes);
  const documentXml = zipText(entries, "word/document.xml");
  if (!documentXml) {
    throw new ImportError("corrupted_file", "Documento do Word invalido: word/document.xml nao encontrado.");
  }

  const warnings = new Set<ImportWarningCode>();
  const { styles, defaults } = readStyles(entries);
  const ctx: DocxContext = {
    entries,
    rels: readRelationships(entries),
    styles,
    numbering: readNumbering(entries),
    assets: [],
    assetByPath: new Map(),
    defaultAnnotations: annotationsFromRPr(defaults, {}),
    warn: (code) => warnings.add(code),
  };

  const root = parseMarkup(documentXml, { xml: true });
  const body = descendantNamed(root, "body");
  const blocks = body ? normalizeBlocks(convertBody(body, ctx)) : [];

  const headingTitle = blocks
    .filter((block) => block.type === "heading_1" || block.type === "heading_2")
    .map((block) => spansPlainText(block.richText).trim())
    .find(Boolean);
  const baseName = sourceFileName.replace(/\.(docx|docm|dotx)$/i, "").trim();
  const fallbackTitle = blocks.map((block) => spansPlainText(block.richText).trim()).find(Boolean);

  return {
    sourceId: `docx_${nanoid(10)}`,
    title: documentTitle(entries) || headingTitle || baseName || fallbackTitle?.slice(0, 120) || "Documento",
    blocks,
    tags: [],
    assets: ctx.assets,
    source,
    sourceFileName,
    warnings: [...warnings],
  };
}
