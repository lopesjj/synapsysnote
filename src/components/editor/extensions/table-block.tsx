"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Node as TiptapNode, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { NodeSelection, Plugin, PluginKey } from "@tiptap/pm/state";
import { Slice, Fragment } from "@tiptap/pm/model";
import { dropPoint } from "@tiptap/pm/transform";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  Bold,
  Eraser,
  GripVertical,
  Highlighter,
  Italic,
  Plus,
  Strikethrough,
  Trash2,
  Underline as UnderlineIcon,
} from "lucide-react";
import type { RichTextAnnotations, RichTextSpan } from "@/types/models";
import { TEXT_COLORS, HIGHLIGHT_COLORS } from "@/components/editor/editor-colors";
import { cn } from "@/lib/utils";

export type TableGrid = RichTextSpan[][][];

export type CellAlignment = {
  horizontal?: "left" | "center" | "right";
  vertical?: "top" | "middle" | "bottom";
};

export type TableMultiAction =
  | { type: "annotation"; key: keyof RichTextAnnotations }
  | { type: "color"; color: string | null }
  | { type: "highlight"; highlight: string | null }
  | { type: "align-horizontal"; align: "left" | "center" | "right" }
  | { type: "align-vertical"; align: "top" | "middle" | "bottom" }
  | { type: "clear" };

export function dispatchTableMultiAction(action: TableMultiAction): boolean {
  if (typeof window === "undefined") return false;
  const activeMultiToolbar = document.querySelector("[data-multi-table-toolbar]");
  if (!activeMultiToolbar) return false;
  window.dispatchEvent(new CustomEvent("synapsys:table-multi-action", { detail: action }));
  return true;
}

let activeDraggedTablePos: number | null = null;

export function emptyTableGrid(rows = 3, cols = 3): TableGrid {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => [] as RichTextSpan[]));
}

function cloneGrid(rows: TableGrid): TableGrid {
  return rows.map((row) => [...row]);
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function spansToHtml(spans: RichTextSpan[]): string {
  if (!spans.length) return "";
  return spans
    .map((span) => {
      const html = span.text.split("\n").map(escapeHtml).join("<br>");
      const a = span.annotations;
      if (!a) return html;
      let out = html;
      if (a.bold) out = `<strong>${out}</strong>`;
      if (a.italic) out = `<em>${out}</em>`;
      if (a.underline) out = `<u>${out}</u>`;
      if (a.strikethrough) out = `<s>${out}</s>`;
      if (a.color) out = `<span style="color: ${a.color}">${out}</span>`;
      if (a.highlight) {
        const bg = typeof a.highlight === "string" ? a.highlight : "#fef08a";
        out = `<mark style="background-color: ${bg}; color: inherit">${out}</mark>`;
      }
      return out;
    })
    .join("");
}

function normalizeColor(color?: string | null): string | undefined {
  if (!color || color === "inherit" || color === "transparent") return undefined;
  const match = color.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (match) {
    const r = Number(match[1]).toString(16).padStart(2, "0");
    const g = Number(match[2]).toString(16).padStart(2, "0");
    const b = Number(match[3]).toString(16).padStart(2, "0");
    return `#${r}${g}${b}`.toUpperCase();
  }
  if (color.startsWith("#")) {
    return color.toUpperCase();
  }
  return color;
}

function annotationsEqual(a: RichTextAnnotations, b: RichTextAnnotations): boolean {
  return (
    Boolean(a.bold) === Boolean(b.bold) &&
    Boolean(a.italic) === Boolean(b.italic) &&
    Boolean(a.underline) === Boolean(b.underline) &&
    Boolean(a.strikethrough) === Boolean(b.strikethrough) &&
    (normalizeColor(a.color) || undefined) === (normalizeColor(b.color) || undefined) &&
    (normalizeColor(typeof a.highlight === "string" ? a.highlight : undefined) || Boolean(a.highlight)) ===
      (normalizeColor(typeof b.highlight === "string" ? b.highlight : undefined) || Boolean(b.highlight))
  );
}

function domToSpans(root: Node): RichTextSpan[] {
  const spans: RichTextSpan[] = [];
  let currentText = "";
  let currentAnnotations: RichTextAnnotations = {};

  const flush = () => {
    if (currentText.length) {
      spans.push({
        text: currentText,
        ...(Object.keys(currentAnnotations).length ? { annotations: { ...currentAnnotations } } : {}),
      });
    }
    currentText = "";
  };

  const appendText = (text: string, annotations: RichTextAnnotations) => {
    if (!text) return;
    const isFirst = spans.length === 0 && currentText === "";
    if (isFirst) {
      currentAnnotations = annotations;
    } else if (!annotationsEqual(currentAnnotations, annotations)) {
      flush();
      currentAnnotations = annotations;
    }
    currentText += text;
  };

  const walk = (node: ChildNode, annotations: RichTextAnnotations) => {
    if (node.nodeType === Node.TEXT_NODE) {
      appendText(node.textContent ?? "", annotations);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    if (tag === "br") {
      appendText("\n", annotations);
      return;
    }

    const next: RichTextAnnotations = { ...annotations };
    if (tag === "b" || tag === "strong") next.bold = true;
    if (tag === "i" || tag === "em") next.italic = true;
    if (tag === "u") next.underline = true;
    if (tag === "s" || tag === "strike" || tag === "del") next.strikethrough = true;
    if (tag === "mark") {
      const bg = normalizeColor(el.style.backgroundColor);
      next.highlight = bg || true;
    }

    if (el.style && el.style.color && el.style.color !== "inherit") {
      const col = normalizeColor(el.style.color);
      if (col) next.color = col;
    } else if (tag === "font" && el.getAttribute("color")) {
      const col = normalizeColor(el.getAttribute("color"));
      if (col) next.color = col;
    }

    if (el.style && el.style.backgroundColor && el.style.backgroundColor !== "transparent") {
      const bg = normalizeColor(el.style.backgroundColor);
      if (bg) next.highlight = bg;
    }

    Array.from(el.childNodes).forEach((child) => walk(child, next));

    const isBlock = tag === "div" || tag === "p";
    if (isBlock && el.nextSibling) appendText("\n", annotations);
  };

  Array.from(root.childNodes).forEach((child) => walk(child, {}));
  flush();
  return spans;
}

function keepSelection(event: React.MouseEvent) {
  event.preventDefault();
}

function EditableCell({
  spans,
  onChange,
  editable,
  placeholder,
  className,
  minHeight,
  horizontalAlign = "left",
  verticalAlign = "top",
  onAlignHorizontal,
  onAlignVertical,
  onCellFocus,
  isSelectionActive = false,
}: {
  spans: RichTextSpan[];
  onChange: (next: RichTextSpan[]) => void;
  editable: boolean;
  placeholder?: string;
  className?: string;
  minHeight?: number;
  horizontalAlign?: "left" | "center" | "right";
  verticalAlign?: "top" | "middle" | "bottom";
  onAlignHorizontal?: (align: "left" | "center" | "right") => void;
  onAlignVertical?: (align: "top" | "middle" | "bottom") => void;
  onCellFocus?: () => void;
  isSelectionActive?: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const focusedRef = useRef(false);
  const savedRangeRef = useRef<Range | null>(null);
  const [selectionRect, setSelectionRect] = useState<{ top: number; left: number; above: boolean } | null>(null);
  const [colorPicker, setColorPicker] = useState<"text" | "highlight" | null>(null);

  useEffect(() => {
    if (isSelectionActive) {
      focusedRef.current = false;
      setSelectionRect(null);
      setColorPicker(null);
    }
  }, [isSelectionActive]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (focusedRef.current && !isSelectionActive) return;
    const html = spansToHtml(spans);
    if (el.innerHTML !== html) el.innerHTML = html;
  }, [spans, isSelectionActive]);

  const sync = () => {
    const el = ref.current;
    if (!el) return;
    onChange(domToSpans(el));
  };

  const updateSelection = () => {
    if (typeof window === "undefined") return;
    const sel = window.getSelection();
    if (
      isSelectionActive ||
      !sel ||
      sel.isCollapsed ||
      !sel.toString().trim() ||
      !ref.current ||
      !ref.current.contains(sel.anchorNode)
    ) {
      setSelectionRect(null);
      return;
    }

    try {
      const range = sel.getRangeAt(0);
      savedRangeRef.current = range.cloneRange();
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        setSelectionRect(null);
        return;
      }
      const above = rect.top >= 60;
      setSelectionRect({
        top: above ? rect.top - 8 : rect.bottom + 8,
        left: Math.max(120, Math.min(window.innerWidth - 120, rect.left + rect.width / 2)),
        above,
      });
    } catch {
      setSelectionRect(null);
    }
  };

  useEffect(() => {
    const onDocSelectionChange = () => {
      if (focusedRef.current) {
        updateSelection();
      }
    };
    document.addEventListener("selectionchange", onDocSelectionChange);
    window.addEventListener("scroll", onDocSelectionChange, true);
    window.addEventListener("resize", onDocSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", onDocSelectionChange);
      window.removeEventListener("scroll", onDocSelectionChange, true);
      window.removeEventListener("resize", onDocSelectionChange);
    };
  }, []);

  const restoreSelection = () => {
    if (!savedRangeRef.current) return;
    const sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(savedRangeRef.current);
    }
  };

  const applyCommand = (command: string) => {
    restoreSelection();
    document.execCommand(command);
    sync();
    updateSelection();
  };

  const applyColor = (color: string | null) => {
    restoreSelection();
    document.execCommand("styleWithCSS", false, "true");
    if (color) {
      document.execCommand("foreColor", false, color);
    } else {
      document.execCommand("foreColor", false, "inherit");
    }
    sync();
    updateSelection();
  };

  const applyHighlight = (color: string | null) => {
    restoreSelection();
    document.execCommand("styleWithCSS", false, "true");
    if (color) {
      document.execCommand("hiliteColor", false, color);
    } else {
      document.execCommand("hiliteColor", false, "transparent");
    }
    sync();
    updateSelection();
  };

  if (!editable) {
    return (
      <div
        className={cn(
          "flex flex-col w-full h-full min-h-full",
          verticalAlign === "middle" ? "justify-center" : verticalAlign === "bottom" ? "justify-end" : "justify-start"
        )}
        style={minHeight ? { minHeight: `${minHeight}px` } : undefined}
      >
        <div
          className={cn(
            "w-full whitespace-pre-wrap break-words",
            horizontalAlign === "center" ? "text-center" : horizontalAlign === "right" ? "text-right" : "text-left",
            className
          )}
          style={{ textAlign: horizontalAlign }}
          dangerouslySetInnerHTML={{ __html: spansToHtml(spans) }}
        />
      </div>
    );
  }

  const floatingToolbar =
    selectionRect && typeof document !== "undefined"
      ? createPortal(
          <div
            contentEditable={false}
            style={{
              position: "fixed",
              top: `${selectionRect.top}px`,
              left: `${selectionRect.left}px`,
              transform: selectionRect.above ? "translate(-50%, -100%)" : "translate(-50%, 0)",
              zIndex: 99999,
            }}
            className="flex flex-col rounded-[var(--radius-md)] border border-[var(--border)] dark:border-white/15 bg-[var(--surface)] dark:bg-[#0d1824] p-1 shadow-[var(--shadow-float)] dark:shadow-black/70"
          >
            <div className="flex items-center gap-0.5">
              {[
                { mark: "bold", Icon: Bold, label: "Negrito (Ctrl+B)" },
                { mark: "italic", Icon: Italic, label: "Itálico (Ctrl+I)" },
                { mark: "underline", Icon: UnderlineIcon, label: "Sublinhado (Ctrl+U)" },
                { mark: "strikeThrough", Icon: Strikethrough, label: "Tachado" },
              ].map(({ mark, Icon, label }) => (
                <button
                  key={mark}
                  type="button"
                  title={label}
                  onMouseDown={keepSelection}
                  onClick={() => applyCommand(mark)}
                  className="rounded-[var(--radius-xs)] p-1.5 text-muted dark:text-slate-300 transition hover:bg-[var(--surface-hover)] dark:hover:bg-white/10 hover:text-ink dark:hover:text-white"
                >
                  <Icon className="size-3.5" />
                </button>
              ))}

              <span className="mx-0.5 h-4 w-px bg-[var(--border)] dark:bg-white/10" />

              <button
                type="button"
                title="Cor do texto"
                onMouseDown={keepSelection}
                onClick={() => setColorPicker((cur) => (cur === "text" ? null : "text"))}
                className={cn(
                  "rounded-[var(--radius-xs)] p-1.5 text-muted dark:text-slate-300 transition hover:bg-[var(--surface-hover)] dark:hover:bg-white/10 hover:text-ink dark:hover:text-white",
                  colorPicker === "text" && "bg-[var(--accent-soft)] text-[var(--accent)] dark:bg-[var(--accent)]/20"
                )}
              >
                <span className="relative inline-flex min-w-[14px] justify-center text-[12px] font-bold leading-none">
                  A
                  <span className="absolute inset-x-0 -bottom-0.5 h-0.5 rounded-full bg-current" />
                </span>
              </button>

              <button
                type="button"
                title="Destaque"
                onMouseDown={keepSelection}
                onClick={() => setColorPicker((cur) => (cur === "highlight" ? null : "highlight"))}
                className={cn(
                  "rounded-[var(--radius-xs)] p-1.5 text-muted dark:text-slate-300 transition hover:bg-[var(--surface-hover)] dark:hover:bg-white/10 hover:text-ink dark:hover:text-white",
                  colorPicker === "highlight" && "bg-[var(--accent-soft)] text-[var(--accent)] dark:bg-[var(--accent)]/20"
                )}
              >
                <Highlighter className="size-3.5" />
              </button>

              <span className="mx-0.5 h-4 w-px bg-[var(--border)] dark:bg-white/10" />

              {[
                { align: "left" as const, Icon: AlignLeft, label: "Alinhar à esquerda" },
                { align: "center" as const, Icon: AlignCenter, label: "Centralizar horizontalmente" },
                { align: "right" as const, Icon: AlignRight, label: "Alinhar à direita" },
              ].map(({ align, Icon, label }) => (
                <button
                  key={align}
                  type="button"
                  title={label}
                  onMouseDown={keepSelection}
                  onClick={() => onAlignHorizontal?.(align)}
                  className={cn(
                    "rounded-[var(--radius-xs)] p-1.5 text-muted dark:text-slate-300 transition hover:bg-[var(--surface-hover)] dark:hover:bg-white/10 hover:text-ink dark:hover:text-white",
                    horizontalAlign === align && "bg-[var(--accent-soft)] text-[var(--accent)] dark:bg-[var(--accent)]/20"
                  )}
                >
                  <Icon className="size-3.5" />
                </button>
              ))}

              <span className="mx-0.5 h-4 w-px bg-[var(--border)] dark:bg-white/10" />

              {[
                { align: "top" as const, Icon: AlignVerticalJustifyStart, label: "Alinhar ao topo (superior)" },
                { align: "middle" as const, Icon: AlignVerticalJustifyCenter, label: "Alinhar ao meio (centro vertical)" },
                { align: "bottom" as const, Icon: AlignVerticalJustifyEnd, label: "Alinhar à base (inferior)" },
              ].map(({ align, Icon, label }) => (
                <button
                  key={align}
                  type="button"
                  title={label}
                  onMouseDown={keepSelection}
                  onClick={() => onAlignVertical?.(align)}
                  className={cn(
                    "rounded-[var(--radius-xs)] p-1.5 text-muted dark:text-slate-300 transition hover:bg-[var(--surface-hover)] dark:hover:bg-white/10 hover:text-ink dark:hover:text-white",
                    verticalAlign === align && "bg-[var(--accent-soft)] text-[var(--accent)] dark:bg-[var(--accent)]/20"
                  )}
                >
                  <Icon className="size-3.5" />
                </button>
              ))}
            </div>

            {colorPicker === "text" ? (
              <div className="mt-1 border-t border-[var(--border)] dark:border-white/10 pt-1">
                <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-faint dark:text-slate-400">
                  Cor do texto
                </p>
                <div className="grid grid-cols-6 gap-1 p-1">
                  {TEXT_COLORS.map((color) => (
                    <button
                      key={color.label}
                      type="button"
                      title={color.label}
                      onMouseDown={keepSelection}
                      onClick={() => {
                        applyColor(color.value);
                        setColorPicker(null);
                      }}
                      className="size-5 rounded-full border border-[var(--border)] dark:border-white/20 transition hover:scale-110"
                      style={{ background: color.value ?? "var(--text)" }}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            {colorPicker === "highlight" ? (
              <div className="mt-1 border-t border-[var(--border)] dark:border-white/10 pt-1">
                <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-faint dark:text-slate-400">
                  Destaque
                </p>
                <div className="grid grid-cols-6 gap-1 p-1">
                  {HIGHLIGHT_COLORS.map((color) => (
                    <button
                      key={color.label}
                      type="button"
                      title={color.label}
                      onMouseDown={keepSelection}
                      onClick={() => {
                        applyHighlight(color.value);
                        setColorPicker(null);
                      }}
                      className="size-5 rounded-[4px] border border-[var(--border)] dark:border-white/20 transition hover:scale-110"
                      style={{ background: color.value ?? "var(--surface)" }}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </div>,
          document.body
        )
      : null;

  return (
    <div
      className={cn(
        "relative flex flex-col w-full h-full min-h-full",
        verticalAlign === "middle" ? "justify-center" : verticalAlign === "bottom" ? "justify-end" : "justify-start"
      )}
      style={minHeight ? { minHeight: `${minHeight}px` } : undefined}
      onClick={() => {
        if (!isSelectionActive && ref.current && document.activeElement !== ref.current) {
          ref.current.focus();
        }
      }}
    >
      {!isSelectionActive ? floatingToolbar : null}
      <div
        ref={ref}
        contentEditable={editable && !isSelectionActive}
        suppressContentEditableWarning
        data-placeholder={placeholder}
        style={{ textAlign: horizontalAlign }}
        className={cn(
          "min-w-0 w-full whitespace-pre-wrap break-words outline-none empty:before:pointer-events-none empty:before:text-faint dark:empty:before:text-slate-500 empty:before:content-[attr(data-placeholder)] text-ink dark:text-slate-100",
          horizontalAlign === "center" ? "text-center" : horizontalAlign === "right" ? "text-right" : "text-left",
          className
        )}
        onDragStart={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onFocus={() => {
          focusedRef.current = true;
          onCellFocus?.();
          updateSelection();
        }}
        onBlur={() => {
          focusedRef.current = false;
          setSelectionRect(null);
          setColorPicker(null);
          sync();
        }}
        onInput={sync}
        onMouseUp={updateSelection}
        onKeyUp={updateSelection}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            document.execCommand("insertLineBreak");
            sync();
            return;
          }
          const meta = event.metaKey || event.ctrlKey;
          if (meta && event.key.toLowerCase() === "b") {
            event.preventDefault();
            document.execCommand("bold");
            sync();
            updateSelection();
          } else if (meta && event.key.toLowerCase() === "i") {
            event.preventDefault();
            document.execCommand("italic");
            sync();
            updateSelection();
          } else if (meta && event.key.toLowerCase() === "u") {
            event.preventDefault();
            document.execCommand("underline");
            sync();
            updateSelection();
          }
        }}
        onPaste={(event) => {
          event.preventDefault();
          const text = event.clipboardData.getData("text/plain");
          document.execCommand("insertText", false, text);
          sync();
          updateSelection();
        }}
      />
    </div>
  );
}

function toggleMultiAnnotation(
  rows: TableGrid,
  coords: { row: number; col: number }[],
  key: keyof RichTextAnnotations
): TableGrid {
  const next = cloneGrid(rows);
  const allHave = coords.every(({ row, col }) => {
    const spans = next[row]?.[col] ?? [];
    return spans.length > 0 && spans.every((s) => Boolean(s.annotations?.[key]));
  });
  const target = !allHave;
  for (const { row, col } of coords) {
    const spans = next[row]?.[col] ?? [];
    if (!spans.length) continue;
    next[row] = [...next[row]];
    next[row][col] = spans.map((span) => ({
      ...span,
      annotations: {
        ...(span.annotations ?? {}),
        [key]: target ? true : undefined,
      },
    }));
  }
  return next;
}

function applyMultiColor(
  rows: TableGrid,
  coords: { row: number; col: number }[],
  color: string | null
): TableGrid {
  const next = cloneGrid(rows);
  for (const { row, col } of coords) {
    const spans = next[row]?.[col] ?? [];
    if (!spans.length) continue;
    next[row] = [...next[row]];
    next[row][col] = spans.map((span) => ({
      ...span,
      annotations: {
        ...(span.annotations ?? {}),
        color: color ?? undefined,
      },
    }));
  }
  return next;
}

function applyMultiHighlight(
  rows: TableGrid,
  coords: { row: number; col: number }[],
  highlight: string | null
): TableGrid {
  const next = cloneGrid(rows);
  for (const { row, col } of coords) {
    const spans = next[row]?.[col] ?? [];
    if (!spans.length) continue;
    next[row] = [...next[row]];
    next[row][col] = spans.map((span) => ({
      ...span,
      annotations: {
        ...(span.annotations ?? {}),
        highlight: highlight ?? undefined,
      },
    }));
  }
  return next;
}

function clearMultiCells(
  rows: TableGrid,
  coords: { row: number; col: number }[]
): TableGrid {
  const next = cloneGrid(rows);
  for (const { row, col } of coords) {
    next[row] = [...next[row]];
    next[row][col] = [];
  }
  return next;
}

function TableView({ node, updateAttributes, editor, getPos }: NodeViewProps) {
  const rows = (node.attrs.rows as TableGrid) ?? emptyTableGrid();
  const hasHeader = Boolean(node.attrs.hasColumnHeader);
  const editable = editor.isEditable;
  const colCount = Math.max(1, ...rows.map((row) => row.length));
  const rawColWidths = (node.attrs.colWidths as number[]) ?? [];
  const colWidths = Array.from({ length: colCount }, (_, i) => rawColWidths[i] || 150);
  const rowHeights = (node.attrs.rowHeights as number[]) ?? [];
  const rawCellAlignments = (node.attrs.cellAlignments as (CellAlignment | null)[][]) ?? [];
  const [activeCell, setActiveCell] = useState<{ row: number; col: number } | null>(null);

  const tableRef = useRef<HTMLTableElement | null>(null);
  const [selectionStart, setSelectionStart] = useState<{ row: number; col: number } | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<{ row: number; col: number } | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const isSelectingRef = useRef(false);
  const selectionStartRef = useRef<{ row: number; col: number } | null>(null);
  const selectionEndRef = useRef<{ row: number; col: number } | null>(null);
  const isMouseDownRef = useRef(false);
  const dragOriginRef = useRef<{ row: number; col: number } | null>(null);
  const [multiToolbarRect, setMultiToolbarRect] = useState<{ top: number; left: number; above: boolean } | null>(null);
  const [multiColorPicker, setMultiColorPicker] = useState<"text" | "highlight" | null>(null);

  useEffect(() => {
    isSelectingRef.current = isSelecting;
  }, [isSelecting]);

  useEffect(() => {
    selectionStartRef.current = selectionStart;
  }, [selectionStart]);

  useEffect(() => {
    selectionEndRef.current = selectionEnd;
  }, [selectionEnd]);

  const getSelectedCoords = (): { row: number; col: number }[] => {
    const s = selectionStartRef.current || selectionStart;
    const end = selectionEndRef.current || selectionEnd;
    if (!s || !end) return [];
    const minR = Math.min(s.row, end.row);
    const maxR = Math.max(s.row, end.row);
    const minC = Math.min(s.col, end.col);
    const maxC = Math.max(s.col, end.col);
    const coords: { row: number; col: number }[] = [];
    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        coords.push({ row: r, col: c });
      }
    }
    return coords;
  };

  const selectedCoords = getSelectedCoords();
  const hasMultiSelection = selectedCoords.length > 1;

  const isCellSelected = (r: number, c: number): boolean => {
    if (!hasMultiSelection || !selectionStart || !selectionEnd) return false;
    const minR = Math.min(selectionStart.row, selectionEnd.row);
    const maxR = Math.max(selectionStart.row, selectionEnd.row);
    const minC = Math.min(selectionStart.col, selectionEnd.col);
    const maxC = Math.max(selectionStart.col, selectionEnd.col);
    return r >= minR && r <= maxR && c >= minC && c <= maxC;
  };

  const updateMultiToolbarPosition = () => {
    if (!tableRef.current || !selectionStartRef.current || !selectionEndRef.current) {
      setMultiToolbarRect(null);
      return;
    }
    const s = selectionStartRef.current;
    const e = selectionEndRef.current;
    const minR = Math.min(s.row, e.row);
    const maxR = Math.max(s.row, e.row);
    const minC = Math.min(s.col, e.col);
    const maxC = Math.max(s.col, e.col);

    if (minR === maxR && minC === maxC) {
      setMultiToolbarRect(null);
      return;
    }

    const cells = tableRef.current.querySelectorAll<HTMLElement>("[data-cell-coord]");
    let top = Infinity;
    let bottom = -Infinity;
    let left = Infinity;
    let right = -Infinity;
    let found = false;

    cells.forEach((el) => {
      const coord = el.getAttribute("data-cell-coord");
      if (!coord) return;
      const [r, c] = coord.split(":").map(Number);
      if (r >= minR && r <= maxR && c >= minC && c <= maxC) {
        const rect = el.getBoundingClientRect();
        if (rect.top < top) top = rect.top;
        if (rect.bottom > bottom) bottom = rect.bottom;
        if (rect.left < left) left = rect.left;
        if (rect.right > right) right = rect.right;
        found = true;
      }
    });

    if (!found) {
      setMultiToolbarRect(null);
      return;
    }

    const above = top >= 65;
    setMultiToolbarRect({
      top: above ? top - 8 : bottom + 8,
      left: Math.max(160, Math.min(window.innerWidth - 160, (left + right) / 2)),
      above,
    });
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isMouseDownRef.current || (e.buttons & 1) !== 1 || !dragOriginRef.current) return;

      const targetEl = document.elementFromPoint(e.clientX, e.clientY);
      const cellEl = targetEl?.closest("[data-cell-coord]");
      if (!cellEl || !tableRef.current?.contains(cellEl)) return;

      const coord = cellEl.getAttribute("data-cell-coord");
      if (!coord) return;
      const [r, c] = coord.split(":").map(Number);
      const origin = dragOriginRef.current;

      if (r !== origin.row || c !== origin.col) {
        const sel = window.getSelection();
        if (sel && (!sel.isCollapsed || sel.rangeCount > 0)) {
          sel.removeAllRanges();
        }
        if (document.activeElement && document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        if (!isSelectingRef.current) {
          setIsSelecting(true);
          isSelectingRef.current = true;
        }
        setSelectionStart(origin);
        selectionStartRef.current = origin;
        setSelectionEnd({ row: r, col: c });
        selectionEndRef.current = { row: r, col: c };
      } else if (isSelectingRef.current) {
        setSelectionEnd({ row: r, col: c });
        selectionEndRef.current = { row: r, col: c };
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!isMouseDownRef.current) return;
      const wasSelecting = isSelectingRef.current;
      isMouseDownRef.current = false;
      dragOriginRef.current = null;
      setIsSelecting(false);
      isSelectingRef.current = false;

      const s = selectionStartRef.current;
      const endCoord = selectionEndRef.current;
      if (wasSelecting && s && endCoord && (s.row !== endCoord.row || s.col !== endCoord.col)) {
        updateMultiToolbarPosition();
      } else if (!wasSelecting) {
        const target = e.target as HTMLElement | null;
        const isToolbar =
          target?.closest("[data-multi-table-toolbar]") ||
          target?.closest("[data-table-toolbar]") ||
          target?.closest("[data-editor-toolbar]");
        if (!isToolbar && !e.shiftKey) {
          setSelectionStart(null);
          setSelectionEnd(null);
          setMultiToolbarRect(null);
        }
      }
    };

    const handleDocMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!tableRef.current) return;
      const isInsideTable = tableRef.current.contains(target);
      const isToolbar =
        target?.closest("[data-multi-table-toolbar]") ||
        target?.closest("[data-table-toolbar]") ||
        target?.closest("[data-editor-toolbar]") ||
        target?.closest(".editor-toolbar") ||
        target?.closest("[data-radix-popper-content-wrapper]");

      if (!isInsideTable && !isToolbar) {
        if (selectionStartRef.current && selectionEndRef.current) {
          setSelectionStart(null);
          setSelectionEnd(null);
          setMultiToolbarRect(null);
        }
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const s = selectionStartRef.current;
      const end = selectionEndRef.current;
      const isMulti = s && end && (s.row !== end.row || s.col !== end.col);
      if (!isMulti) return;

      if (e.key === "Escape") {
        setSelectionStart(null);
        setSelectionEnd(null);
        setMultiToolbarRect(null);
        return;
      }

      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        const coords = getSelectedCoords();
        commit(clearMultiCells(rows, coords));
        setTimeout(updateMultiToolbarPosition, 0);
        return;
      }

      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "b") {
        e.preventDefault();
        const coords = getSelectedCoords();
        commit(toggleMultiAnnotation(rows, coords, "bold"));
        setTimeout(updateMultiToolbarPosition, 0);
      } else if (meta && e.key.toLowerCase() === "i") {
        e.preventDefault();
        const coords = getSelectedCoords();
        commit(toggleMultiAnnotation(rows, coords, "italic"));
        setTimeout(updateMultiToolbarPosition, 0);
      } else if (meta && e.key.toLowerCase() === "u") {
        e.preventDefault();
        const coords = getSelectedCoords();
        commit(toggleMultiAnnotation(rows, coords, "underline"));
        setTimeout(updateMultiToolbarPosition, 0);
      }
    };

    const handleScrollOrResize = () => {
      const s = selectionStartRef.current;
      const e = selectionEndRef.current;
      if (s && e && (s.row !== e.row || s.col !== e.col)) {
        updateMultiToolbarPosition();
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("mousedown", handleDocMouseDown);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("mousedown", handleDocMouseDown);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [rows]);

  const handleCellMouseDown = (row: number, col: number, e: React.MouseEvent) => {
    if (!editable) return;
    if (e.button !== 0) return;

    if (e.shiftKey && selectionStartRef.current) {
      e.preventDefault();
      setSelectionEnd({ row, col });
      selectionEndRef.current = { row, col };
      setTimeout(updateMultiToolbarPosition, 0);
      return;
    }

    if (selectionStartRef.current && selectionEndRef.current) {
      const s = selectionStartRef.current;
      const end = selectionEndRef.current;
      if (s.row !== end.row || s.col !== end.col) {
        setSelectionStart(null);
        setSelectionEnd(null);
        setMultiToolbarRect(null);
      }
    }

    dragOriginRef.current = { row, col };
    isMouseDownRef.current = true;
    selectionStartRef.current = { row, col };
    selectionEndRef.current = { row, col };
  };

  const handleCellMouseEnter = (row: number, col: number, e: React.MouseEvent) => {
    if (!editable || (e.buttons & 1) !== 1) return;
    const origin = dragOriginRef.current;
    if (!origin) return;

    if (origin.row !== row || origin.col !== col) {
      const sel = window.getSelection();
      if (sel && (!sel.isCollapsed || sel.rangeCount > 0)) {
        sel.removeAllRanges();
      }
      if (document.activeElement && document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      if (!isSelectingRef.current) {
        setIsSelecting(true);
        isSelectingRef.current = true;
      }
      setSelectionStart(origin);
      selectionStartRef.current = origin;
      setSelectionEnd({ row, col });
      selectionEndRef.current = { row, col };
    } else if (isSelectingRef.current) {
      setSelectionEnd({ row, col });
      selectionEndRef.current = { row, col };
    }
  };

  const selectColumn = (col: number) => {
    setSelectionStart({ row: 0, col });
    setSelectionEnd({ row: rows.length - 1, col });
    setTimeout(updateMultiToolbarPosition, 0);
  };

  const handleMultiToggleAnnotation = (key: keyof RichTextAnnotations) => {
    const coords = getSelectedCoords();
    if (!coords.length) return;
    commit(toggleMultiAnnotation(rows, coords, key));
    setTimeout(updateMultiToolbarPosition, 0);
  };

  const handleMultiApplyColor = (color: string | null) => {
    const coords = getSelectedCoords();
    if (!coords.length) return;
    commit(applyMultiColor(rows, coords, color));
    setTimeout(updateMultiToolbarPosition, 0);
  };

  const handleMultiApplyHighlight = (highlight: string | null) => {
    const coords = getSelectedCoords();
    if (!coords.length) return;
    commit(applyMultiHighlight(rows, coords, highlight));
    setTimeout(updateMultiToolbarPosition, 0);
  };

  const handleMultiAlignHorizontal = (align: "left" | "center" | "right") => {
    const coords = getSelectedCoords();
    if (!coords.length) return;
    const next: (CellAlignment | null)[][] = Array.from({ length: rows.length }, (_, r) =>
      Array.from({ length: colCount }, (_, c) => {
        const cur = rawCellAlignments?.[r]?.[c] ?? { horizontal: "left", vertical: "top" };
        return { ...cur };
      })
    );
    for (const { row, col } of coords) {
      if (next[row] && next[row][col]) {
        next[row][col] = { ...next[row][col], horizontal: align };
      }
    }
    commit(cloneGrid(rows), colWidths, hasHeader, rowHeights, next);
    setTimeout(updateMultiToolbarPosition, 0);
  };

  const handleMultiAlignVertical = (align: "top" | "middle" | "bottom") => {
    const coords = getSelectedCoords();
    if (!coords.length) return;
    const next: (CellAlignment | null)[][] = Array.from({ length: rows.length }, (_, r) =>
      Array.from({ length: colCount }, (_, c) => {
        const cur = rawCellAlignments?.[r]?.[c] ?? { horizontal: "left", vertical: "top" };
        return { ...cur };
      })
    );
    for (const { row, col } of coords) {
      if (next[row] && next[row][col]) {
        next[row][col] = { ...next[row][col], vertical: align };
      }
    }
    commit(cloneGrid(rows), colWidths, hasHeader, rowHeights, next);
    setTimeout(updateMultiToolbarPosition, 0);
  };

  const handleMultiClearContent = () => {
    const coords = getSelectedCoords();
    if (!coords.length) return;
    commit(clearMultiCells(rows, coords));
    setTimeout(updateMultiToolbarPosition, 0);
  };

  useEffect(() => {
    if (!hasMultiSelection) return;
    const onAction = (e: Event) => {
      const custom = e as CustomEvent<TableMultiAction>;
      if (!custom.detail) return;
      const action = custom.detail;
      if (action.type === "annotation") {
        handleMultiToggleAnnotation(action.key);
      } else if (action.type === "color") {
        handleMultiApplyColor(action.color);
      } else if (action.type === "highlight") {
        handleMultiApplyHighlight(action.highlight);
      } else if (action.type === "align-horizontal") {
        handleMultiAlignHorizontal(action.align);
      } else if (action.type === "align-vertical") {
        handleMultiAlignVertical(action.align);
      } else if (action.type === "clear") {
        handleMultiClearContent();
      }
    };
    window.addEventListener("synapsys:table-multi-action", onAction);
    return () => {
      window.removeEventListener("synapsys:table-multi-action", onAction);
    };
  }, [hasMultiSelection, rows, colWidths, hasHeader, rowHeights, rawCellAlignments]);

  const getCellAlignment = (r: number, c: number): CellAlignment => {
    return rawCellAlignments?.[r]?.[c] ?? { horizontal: "left", vertical: "top" };
  };

  const setCellAlignment = (
    r: number,
    c: number,
    update: Partial<CellAlignment>
  ) => {
    const next: (CellAlignment | null)[][] = Array.from({ length: rows.length }, (_, rowIndex) =>
      Array.from({ length: colCount }, (_, colIndex) => {
        const current = rawCellAlignments?.[rowIndex]?.[colIndex] ?? { horizontal: "left", vertical: "top" };
        if (rowIndex === r && colIndex === c) {
          return { ...current, ...update };
        }
        return current;
      })
    );
    updateAttributes({ cellAlignments: next });
  };

  const setColAlignment = (c: number, update: Partial<CellAlignment>) => {
    const next: (CellAlignment | null)[][] = Array.from({ length: rows.length }, (_, rowIndex) =>
      Array.from({ length: colCount }, (_, colIndex) => {
        const current = rawCellAlignments?.[rowIndex]?.[colIndex] ?? { horizontal: "left", vertical: "top" };
        if (colIndex === c) {
          return { ...current, ...update };
        }
        return current;
      })
    );
    updateAttributes({ cellAlignments: next });
  };

  const commit = (
    next: TableGrid,
    nextWidths = colWidths,
    header = hasHeader,
    nextHeights = rowHeights,
    nextAlignments = rawCellAlignments
  ) => {
    updateAttributes({
      rows: next,
      colWidths: nextWidths,
      hasColumnHeader: header,
      rowHeights: nextHeights,
      cellAlignments: nextAlignments,
    });
  };

  const setCell = (row: number, col: number, value: RichTextSpan[]) => {
    const next = cloneGrid(rows);
    next[row] = [...next[row]];
    next[row][col] = value;
    commit(next);
  };

  const addRow = () => {
    commit(
      [...cloneGrid(rows), Array.from({ length: colCount }, () => [] as RichTextSpan[])],
      colWidths,
      hasHeader,
      rowHeights,
      [...rawCellAlignments, Array.from({ length: colCount }, () => ({ horizontal: "left", vertical: "top" }))]
    );
  };

  const addCol = () => {
    commit(
      cloneGrid(rows).map((row) => [...row, [] as RichTextSpan[]]),
      [...colWidths, 150],
      hasHeader,
      rowHeights,
      rawCellAlignments.map((row) => [...row, { horizontal: "left", vertical: "top" }])
    );
  };

  const removeRow = (index: number) => {
    if (rows.length <= 1) return;
    commit(
      cloneGrid(rows).filter((_, i) => i !== index),
      colWidths,
      hasHeader,
      rowHeights.filter((_, i) => i !== index),
      rawCellAlignments.filter((_, i) => i !== index)
    );
  };

  const removeCol = (index: number) => {
    if (colCount <= 1) return;
    commit(
      cloneGrid(rows).map((row) => row.filter((_, i) => i !== index)),
      colWidths.filter((_, i) => i !== index),
      hasHeader,
      rowHeights,
      rawCellAlignments.map((row) => row.filter((_, i) => i !== index))
    );
  };

  const onTableDragStart = (e: React.DragEvent) => {
    if (!editor?.view) return;
    try {
      const pos = typeof getPos === "function" ? getPos() : undefined;
      if (typeof pos === "number") {
        activeDraggedTablePos = pos;
        const selection = NodeSelection.create(editor.state.doc, pos);
        if (!editor.state.selection.eq(selection)) {
          editor.view.dispatch(editor.state.tr.setSelection(selection));
        }
        const slice = selection.content();
        (editor.view as any).dragging = { slice, move: true, node: selection };
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", "");
        }
      }
    } catch {}
  };

  const onResizeStart = (colIndex: number, startEvent: React.MouseEvent) => {
    if (!editable) return;
    startEvent.preventDefault();
    startEvent.stopPropagation();
    const startX = startEvent.clientX;
    const initialWidth = colWidths[colIndex] || 150;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      const newWidth = Math.max(60, initialWidth + delta);
      const next = [...colWidths];
      next[colIndex] = newWidth;
      updateAttributes({ colWidths: next });
    };

    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const onRowResizeStart = (rowIndex: number, startEvent: React.MouseEvent) => {
    if (!editable) return;
    startEvent.preventDefault();
    startEvent.stopPropagation();
    const startY = startEvent.clientY;
    const rowEl = (startEvent.currentTarget as HTMLElement).closest("tr");
    const initialHeight = rowHeights[rowIndex] || rowEl?.getBoundingClientRect().height || 36;

    const onMouseMove = (moveEvent: MouseEvent) => {
      moveEvent.preventDefault();
      const delta = moveEvent.clientY - startY;
      const newHeight = Math.max(28, Math.round(initialHeight + delta));
      const next = [...rowHeights];
      next[rowIndex] = newHeight;
      updateAttributes({ rowHeights: next });
    };

    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const rowResizeHandle = (rowIndex: number) => (
    <div
      onMouseDown={(e) => onRowResizeStart(rowIndex, e)}
      className="absolute inset-x-0 -bottom-1 h-2 cursor-row-resize select-none z-20 hover:bg-[var(--accent)] active:bg-[var(--accent)] transition-colors opacity-0 hover:opacity-100"
      title="Arrastar para redimensionar linha"
    />
  );

  const multiFloatingToolbar =
    hasMultiSelection && multiToolbarRect && typeof document !== "undefined"
      ? createPortal(
          <div
            data-multi-table-toolbar="true"
            contentEditable={false}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              top: `${multiToolbarRect.top}px`,
              left: `${multiToolbarRect.left}px`,
              transform: multiToolbarRect.above ? "translate(-50%, -100%)" : "translate(-50%, 0)",
              zIndex: 99999,
            }}
            className="flex flex-col rounded-[var(--radius-md)] border border-[var(--border)] dark:border-white/15 bg-[var(--surface)] dark:bg-[#0d1824] p-1 shadow-[var(--shadow-float)] dark:shadow-black/70 animate-in fade-in zoom-in-95 duration-100 select-none"
          >
            <div className="flex items-center gap-0.5">
              <span className="px-1.5 py-0.5 text-[11px] font-semibold text-muted dark:text-slate-300 bg-[var(--surface-2)] dark:bg-[#101d2a] rounded-[var(--radius-xs)] mr-0.5">
                {selectedCoords.length} células
              </span>

              <span className="mx-0.5 h-4 w-px bg-[var(--border)] dark:bg-white/10" />

              <button
                type="button"
                title="Negrito (Ctrl+B)"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onClick={() => handleMultiToggleAnnotation("bold")}
                className="rounded-[var(--radius-xs)] p-1.5 text-muted dark:text-slate-300 transition hover:bg-[var(--surface-hover)] dark:hover:bg-white/10 hover:text-ink dark:hover:text-white"
              >
                <Bold className="size-3.5" />
              </button>
              <button
                type="button"
                title="Itálico (Ctrl+I)"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onClick={() => handleMultiToggleAnnotation("italic")}
                className="rounded-[var(--radius-xs)] p-1.5 text-muted dark:text-slate-300 transition hover:bg-[var(--surface-hover)] dark:hover:bg-white/10 hover:text-ink dark:hover:text-white"
              >
                <Italic className="size-3.5" />
              </button>
              <button
                type="button"
                title="Sublinhado (Ctrl+U)"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onClick={() => handleMultiToggleAnnotation("underline")}
                className="rounded-[var(--radius-xs)] p-1.5 text-muted dark:text-slate-300 transition hover:bg-[var(--surface-hover)] dark:hover:bg-white/10 hover:text-ink dark:hover:text-white"
              >
                <UnderlineIcon className="size-3.5" />
              </button>
              <button
                type="button"
                title="Tachado"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onClick={() => handleMultiToggleAnnotation("strikethrough")}
                className="rounded-[var(--radius-xs)] p-1.5 text-muted dark:text-slate-300 transition hover:bg-[var(--surface-hover)] dark:hover:bg-white/10 hover:text-ink dark:hover:text-white"
              >
                <Strikethrough className="size-3.5" />
              </button>

              <span className="mx-0.5 h-4 w-px bg-[var(--border)] dark:bg-white/10" />

              <button
                type="button"
                title="Cor do texto"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onClick={() => setMultiColorPicker((cur) => (cur === "text" ? null : "text"))}
                className={cn(
                  "rounded-[var(--radius-xs)] p-1.5 text-muted dark:text-slate-300 transition hover:bg-[var(--surface-hover)] dark:hover:bg-white/10 hover:text-ink dark:hover:text-white",
                  multiColorPicker === "text" && "bg-[var(--accent-soft)] text-[var(--accent)] dark:bg-[var(--accent)]/20"
                )}
              >
                <span className="relative inline-flex min-w-[14px] justify-center text-[12px] font-bold leading-none">
                  A
                  <span className="absolute inset-x-0 -bottom-0.5 h-0.5 rounded-full bg-current" />
                </span>
              </button>

              <button
                type="button"
                title="Destaque"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onClick={() => setMultiColorPicker((cur) => (cur === "highlight" ? null : "highlight"))}
                className={cn(
                  "rounded-[var(--radius-xs)] p-1.5 text-muted dark:text-slate-300 transition hover:bg-[var(--surface-hover)] dark:hover:bg-white/10 hover:text-ink dark:hover:text-white",
                  multiColorPicker === "highlight" && "bg-[var(--accent-soft)] text-[var(--accent)] dark:bg-[var(--accent)]/20"
                )}
              >
                <Highlighter className="size-3.5" />
              </button>

              <span className="mx-0.5 h-4 w-px bg-[var(--border)] dark:bg-white/10" />

              {[
                { align: "left" as const, Icon: AlignLeft, label: "Alinhar à esquerda" },
                { align: "center" as const, Icon: AlignCenter, label: "Centralizar horizontalmente" },
                { align: "right" as const, Icon: AlignRight, label: "Alinhar à direita" },
              ].map(({ align, Icon, label }) => (
                <button
                  key={align}
                  type="button"
                  title={label}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onClick={() => handleMultiAlignHorizontal(align)}
                  className="rounded-[var(--radius-xs)] p-1.5 text-muted dark:text-slate-300 transition hover:bg-[var(--surface-hover)] dark:hover:bg-white/10 hover:text-ink dark:hover:text-white"
                >
                  <Icon className="size-3.5" />
                </button>
              ))}

              <span className="mx-0.5 h-4 w-px bg-[var(--border)] dark:bg-white/10" />

              {[
                { align: "top" as const, Icon: AlignVerticalJustifyStart, label: "Alinhar ao topo" },
                { align: "middle" as const, Icon: AlignVerticalJustifyCenter, label: "Alinhar ao meio" },
                { align: "bottom" as const, Icon: AlignVerticalJustifyEnd, label: "Alinhar à base" },
              ].map(({ align, Icon, label }) => (
                <button
                  key={align}
                  type="button"
                  title={label}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onClick={() => handleMultiAlignVertical(align)}
                  className="rounded-[var(--radius-xs)] p-1.5 text-muted dark:text-slate-300 transition hover:bg-[var(--surface-hover)] dark:hover:bg-white/10 hover:text-ink dark:hover:text-white"
                >
                  <Icon className="size-3.5" />
                </button>
              ))}

              <span className="mx-0.5 h-4 w-px bg-[var(--border)] dark:bg-white/10" />

              <button
                type="button"
                title="Limpar conteúdo das células selecionadas"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onClick={handleMultiClearContent}
                className="rounded-[var(--radius-xs)] p-1.5 text-muted dark:text-slate-300 transition hover:bg-[var(--surface-hover)] hover:text-[var(--danger)] dark:hover:text-red-400"
              >
                <Eraser className="size-3.5" />
              </button>
            </div>

            {multiColorPicker === "text" ? (
              <div className="mt-1 border-t border-[var(--border)] dark:border-white/10 pt-1">
                <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-faint dark:text-slate-400">
                  Cor do texto ({selectedCoords.length} células)
                </p>
                <div className="grid grid-cols-6 gap-1 p-1">
                  {TEXT_COLORS.map((color) => (
                    <button
                      key={color.label}
                      type="button"
                      title={color.label}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onClick={() => {
                        handleMultiApplyColor(color.value);
                        setMultiColorPicker(null);
                      }}
                      className="size-5 rounded-full border border-[var(--border)] dark:border-white/20 transition hover:scale-110"
                      style={{ background: color.value ?? "var(--text)" }}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            {multiColorPicker === "highlight" ? (
              <div className="mt-1 border-t border-[var(--border)] dark:border-white/10 pt-1">
                <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-faint dark:text-slate-400">
                  Destaque ({selectedCoords.length} células)
                </p>
                <div className="grid grid-cols-6 gap-1 p-1">
                  {HIGHLIGHT_COLORS.map((color) => (
                    <button
                      key={color.label}
                      type="button"
                      title={color.label}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onClick={() => {
                        handleMultiApplyHighlight(color.value);
                        setMultiColorPicker(null);
                      }}
                      className="size-5 rounded-[4px] border border-[var(--border)] dark:border-white/20 transition hover:scale-110"
                      style={{ background: color.value ?? "var(--surface)" }}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </div>,
          document.body
        )
      : null;

  return (
    <NodeViewWrapper
      className="my-3 group/table relative"
      data-type="table-block"
      data-table-block
      onDragStart={onTableDragStart}
    >
      {multiFloatingToolbar}
      <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[var(--border)] dark:border-white/10 bg-[var(--surface)] shadow-xs">
        <table
          ref={tableRef}
          onMouseDownCapture={(e) => {
            if (!editable || e.button !== 0) return;
            const target = e.target as HTMLElement | null;
            const cellEl = target?.closest("[data-cell-coord]");
            if (cellEl) {
              const coord = cellEl.getAttribute("data-cell-coord");
              if (coord) {
                const [r, c] = coord.split(":").map(Number);
                dragOriginRef.current = { row: r, col: c };
                isMouseDownRef.current = true;
                if (selectionStartRef.current && selectionEndRef.current) {
                  const s = selectionStartRef.current;
                  const end = selectionEndRef.current;
                  if (!e.shiftKey && (s.row !== end.row || s.col !== end.col)) {
                    setSelectionStart(null);
                    setSelectionEnd(null);
                    setMultiToolbarRect(null);
                  }
                }
              }
            }
          }}
          className="w-full border-collapse text-[0.92em]"
          style={{ tableLayout: "fixed" }}
        >
          <colgroup>
            {colWidths.map((width, i) => (
              <col key={i} style={{ width: `${width}px`, minWidth: "60px" }} />
            ))}
            {editable ? <col style={{ width: "36px" }} /> : null}
          </colgroup>
          {hasHeader && rows[0] ? (
            <thead className="bg-[var(--surface-2)] dark:bg-[#101d2a]">
              <tr style={rowHeights[0] ? { height: `${rowHeights[0]}px` } : undefined}>
                {rows[0].map((cell, col) => {
                  const align = getCellAlignment(0, col);
                  const isSelected = hasMultiSelection && isCellSelected(0, col);
                  return (
                    <th
                      key={col}
                      data-cell-coord={`0:${col}`}
                      onMouseDown={(e) => handleCellMouseDown(0, col, e)}
                      onMouseEnter={(e) => handleCellMouseEnter(0, col, e)}
                      onDoubleClick={() => selectColumn(col)}
                      style={{
                        ...(rowHeights[0] ? { height: `${rowHeights[0]}px` } : {}),
                        verticalAlign: align.vertical === "middle" ? "middle" : align.vertical === "bottom" ? "bottom" : "top",
                        textAlign: align.horizontal || "left",
                      }}
                      className={cn(
                        "relative border-b border-r border-[var(--border)] dark:border-white/10 bg-[var(--surface-2)] dark:bg-[#101d2a] px-2 py-1.5 font-semibold text-ink dark:text-slate-100 select-none tracking-tight transition-colors",
                        isSelected && "bg-[var(--accent-soft)]/70 dark:bg-[var(--accent-soft)]/40 ring-2 ring-[var(--accent)] ring-inset z-10"
                      )}
                    >
                      <EditableCell
                        spans={cell}
                        onChange={(value) => setCell(0, col, value)}
                        editable={editable}
                        placeholder={`Coluna ${col + 1}`}
                        className="font-semibold"
                        minHeight={rowHeights[0] ? Math.max(20, rowHeights[0] - 14) : undefined}
                        horizontalAlign={align.horizontal}
                        verticalAlign={align.vertical}
                        onAlignHorizontal={(h) => setCellAlignment(0, col, { horizontal: h })}
                        onAlignVertical={(v) => setCellAlignment(0, col, { vertical: v })}
                        onCellFocus={() => {
                          if (!isMouseDownRef.current && !isSelectingRef.current) {
                            setSelectionStart(null);
                            setSelectionEnd(null);
                            setMultiToolbarRect(null);
                          }
                          setActiveCell({ row: 0, col });
                        }}
                        isSelectionActive={hasMultiSelection}
                      />
                      {editable ? (
                        <div
                          onMouseDown={(e) => onResizeStart(col, e)}
                          className="absolute right-0 top-0 bottom-0 w-2.5 translate-x-1 cursor-col-resize select-none z-10 hover:bg-[var(--accent)] active:bg-[var(--accent)] transition-colors opacity-0 hover:opacity-100"
                          title="Arrastar para redimensionar coluna"
                        />
                      ) : null}
                      {editable ? rowResizeHandle(0) : null}
                    </th>
                  );
                })}
                {editable ? (
                  <th
                    style={rowHeights[0] ? { height: `${rowHeights[0]}px` } : undefined}
                    className="relative w-9 border-b border-[var(--border)] dark:border-white/10 bg-[var(--surface-2)] dark:bg-[#101d2a]"
                  >
                    {rowResizeHandle(0)}
                  </th>
                ) : null}
              </tr>
            </thead>
          ) : null}
          <tbody>
            {rows.slice(hasHeader ? 1 : 0).map((row, offset) => {
              const rowIndex = offset + (hasHeader ? 1 : 0);
              const currentHeight = rowHeights[rowIndex];
              return (
                <tr
                  key={rowIndex}
                  style={currentHeight ? { height: `${currentHeight}px` } : undefined}
                  className="group/row transition-colors hover:bg-[var(--surface-hover)] dark:hover:bg-white/[0.02]"
                >
                  {row.map((cell, col) => {
                    const align = getCellAlignment(rowIndex, col);
                    const isSelected = hasMultiSelection && isCellSelected(rowIndex, col);
                    return (
                      <td
                        key={col}
                        data-cell-coord={`${rowIndex}:${col}`}
                        onMouseDown={(e) => handleCellMouseDown(rowIndex, col, e)}
                        onMouseEnter={(e) => handleCellMouseEnter(rowIndex, col, e)}
                        style={{
                          ...(currentHeight ? { height: `${currentHeight}px` } : {}),
                          verticalAlign: align.vertical === "middle" ? "middle" : align.vertical === "bottom" ? "bottom" : "top",
                          textAlign: align.horizontal || "left",
                        }}
                        className={cn(
                          "relative border-t border-r border-[var(--border)] dark:border-white/10 px-2 py-1.5 transition-colors",
                          isSelected && "bg-[var(--accent-soft)]/70 dark:bg-[var(--accent-soft)]/40 ring-2 ring-[var(--accent)] ring-inset z-10"
                        )}
                      >
                        <EditableCell
                          spans={cell}
                          onChange={(value) => setCell(rowIndex, col, value)}
                          editable={editable}
                          placeholder="…"
                          minHeight={currentHeight ? Math.max(20, currentHeight - 14) : undefined}
                          horizontalAlign={align.horizontal}
                          verticalAlign={align.vertical}
                          onAlignHorizontal={(h) => setCellAlignment(rowIndex, col, { horizontal: h })}
                          onAlignVertical={(v) => setCellAlignment(rowIndex, col, { vertical: v })}
                          onCellFocus={() => {
                            if (!isMouseDownRef.current && !isSelectingRef.current) {
                              setSelectionStart(null);
                              setSelectionEnd(null);
                              setMultiToolbarRect(null);
                            }
                            setActiveCell({ row: rowIndex, col });
                          }}
                          isSelectionActive={hasMultiSelection}
                        />
                        {editable && !hasHeader && rowIndex === 0 ? (
                          <div
                            onMouseDown={(e) => onResizeStart(col, e)}
                            className="absolute right-0 top-0 bottom-0 w-2.5 translate-x-1 cursor-col-resize select-none z-10 hover:bg-[var(--accent)] active:bg-[var(--accent)] transition-colors opacity-0 hover:opacity-100"
                            title="Arrastar para redimensionar coluna"
                          />
                        ) : null}
                        {editable ? rowResizeHandle(rowIndex) : null}
                      </td>
                    );
                  })}
                  {editable ? (
                    <td
                      style={currentHeight ? { height: `${currentHeight}px` } : undefined}
                      className="relative w-9 border-t border-[var(--border)] dark:border-white/10 text-center align-middle"
                    >
                      <button
                        type="button"
                        contentEditable={false}
                        title="Remover linha"
                        onClick={() => removeRow(rowIndex)}
                        className="mx-auto flex size-7 items-center justify-center rounded text-faint transition opacity-100 sm:opacity-0 sm:group-hover/row:opacity-100 hover:bg-[var(--surface-hover)] hover:text-[var(--danger)] dark:hover:bg-red-500/15 dark:hover:text-red-400"
                      >
                        <Trash2 className="size-3" />
                      </button>
                      {rowResizeHandle(rowIndex)}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {editable ? (
        <div
          data-table-toolbar="true"
          data-multi-table-toolbar="true"
          className="mt-1.5 flex flex-wrap items-center gap-2 text-[11.5px] text-muted dark:text-slate-400 select-none"
          contentEditable={false}
          onMouseDown={(e) => {
            e.stopPropagation();
          }}
        >
          <div
            data-drag-handle
            draggable={true}
            onDragStart={onTableDragStart}
            title="Clique e arraste para mover a tabela para cima ou para baixo"
            className="inline-flex items-center gap-1 rounded-[var(--radius-xs)] border border-[var(--border)] dark:border-white/10 bg-[var(--surface-2)] dark:bg-[#101d2a] px-2 py-0.5 font-medium text-ink dark:text-slate-200 shadow-xs transition hover:bg-[var(--surface-hover)] dark:hover:bg-white/10 cursor-grab active:cursor-grabbing select-none"
          >
            <GripVertical className="size-3.5 text-muted dark:text-slate-400" />
            <span>Mover tabela</span>
          </div>

          <div className="h-3 w-px bg-[var(--border)] dark:bg-white/10" />

          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={addRow}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-[var(--surface-hover)] dark:hover:bg-white/10 hover:text-ink dark:hover:text-white"
          >
            <Plus className="size-3" /> Linha
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={addCol}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-[var(--surface-hover)] dark:hover:bg-white/10 hover:text-ink dark:hover:text-white"
          >
            <Plus className="size-3" /> Coluna
          </button>
          {colCount > 1 ? (
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => removeCol(colCount - 1)}
              className="rounded px-1.5 py-0.5 hover:bg-[var(--surface-hover)] dark:hover:bg-white/10 hover:text-ink dark:hover:text-white"
            >
              Remover coluna
            </button>
          ) : null}
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => commit(cloneGrid(rows), colWidths, !hasHeader)}
            className="rounded px-1.5 py-0.5 hover:bg-[var(--surface-hover)] dark:hover:bg-white/10 hover:text-ink dark:hover:text-white"
          >
            {hasHeader ? "Sem cabeçalho" : "Com cabeçalho"}
          </button>

          <div className="h-3 w-px bg-[var(--border)] dark:bg-white/10" />

          {(() => {
            const isMulti = hasMultiSelection;
            const targetRow = activeCell ? activeCell.row : 0;
            const targetCol = activeCell ? activeCell.col : 0;
            const activeAlign = getCellAlignment(targetRow, targetCol);

            const applyActiveHorizontal = (align: "left" | "center" | "right") => {
              if (isMulti) {
                handleMultiAlignHorizontal(align);
              } else if (activeCell) {
                setCellAlignment(activeCell.row, activeCell.col, { horizontal: align });
              } else {
                setColAlignment(0, { horizontal: align });
              }
            };

            const applyActiveVertical = (align: "top" | "middle" | "bottom") => {
              if (isMulti) {
                handleMultiAlignVertical(align);
              } else if (activeCell) {
                setCellAlignment(activeCell.row, activeCell.col, { vertical: align });
              } else {
                setColAlignment(0, { vertical: align });
              }
            };

            return (
              <div className="inline-flex items-center gap-1 rounded-[var(--radius-xs)] border border-[var(--border)] dark:border-white/10 bg-[var(--surface-2)] dark:bg-[#101d2a] px-1.5 py-0.5">
                <span className="text-[10px] font-medium text-muted dark:text-slate-400 mr-0.5">
                  {isMulti
                    ? `${selectedCoords.length} células:`
                    : activeCell
                    ? `(${activeCell.row + 1}, ${activeCell.col + 1}):`
                    : "Alinhar:"}
                </span>

                <div className="inline-flex items-center gap-0.5">
                  {[
                    { align: "left" as const, Icon: AlignLeft, label: "Alinhar à esquerda" },
                    { align: "center" as const, Icon: AlignCenter, label: "Centralizar horizontalmente" },
                    { align: "right" as const, Icon: AlignRight, label: "Alinhar à direita" },
                  ].map(({ align, Icon, label }) => (
                    <button
                      key={align}
                      type="button"
                      title={label}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onClick={() => applyActiveHorizontal(align)}
                      className={cn(
                        "rounded p-1 text-muted dark:text-slate-400 transition hover:bg-[var(--surface-hover)] dark:hover:bg-white/10 hover:text-ink dark:hover:text-white",
                        !isMulti && activeAlign.horizontal === align && "bg-[var(--accent-soft)] text-[var(--accent)] dark:bg-[var(--accent)]/20 dark:text-[var(--accent)] font-semibold"
                      )}
                    >
                      <Icon className="size-3" />
                    </button>
                  ))}
                </div>

                <div className="h-2.5 w-px bg-[var(--border)] dark:bg-white/10 mx-0.5" />

                <div className="inline-flex items-center gap-0.5">
                  {[
                    { align: "top" as const, Icon: AlignVerticalJustifyStart, label: "Alinhar ao topo" },
                    { align: "middle" as const, Icon: AlignVerticalJustifyCenter, label: "Alinhar ao meio" },
                    { align: "bottom" as const, Icon: AlignVerticalJustifyEnd, label: "Alinhar à base" },
                  ].map(({ align, Icon, label }) => (
                    <button
                      key={align}
                      type="button"
                      title={label}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onClick={() => applyActiveVertical(align)}
                      className={cn(
                        "rounded p-1 text-muted dark:text-slate-400 transition hover:bg-[var(--surface-hover)] dark:hover:bg-white/10 hover:text-ink dark:hover:text-white",
                        !isMulti && activeAlign.vertical === align && "bg-[var(--accent-soft)] text-[var(--accent)] dark:bg-[var(--accent)]/20 dark:text-[var(--accent)] font-semibold"
                      )}
                    >
                      <Icon className="size-3" />
                    </button>
                  ))}
                </div>

                {isMulti ? (
                  <>
                    <div className="h-2.5 w-px bg-[var(--border)] dark:bg-white/10 mx-0.5" />
                    <button
                      type="button"
                      title="Limpar conteúdo das células selecionadas"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onClick={handleMultiClearContent}
                      className="rounded px-1 py-0.5 text-[10px] hover:bg-[var(--surface-hover)] dark:hover:bg-white/10 hover:text-[var(--danger)] dark:hover:text-red-400 text-muted dark:text-slate-300"
                    >
                      Limpar
                    </button>
                  </>
                ) : activeCell ? (
                  <>
                    <div className="h-2.5 w-px bg-[var(--border)] dark:bg-white/10 mx-0.5" />
                    <button
                      type="button"
                      title="Aplicar alinhamento na coluna inteira"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onClick={() => setColAlignment(activeCell.col, activeAlign)}
                      className="rounded px-1 py-0.5 text-[10px] hover:bg-[var(--surface-hover)] dark:hover:bg-white/10 hover:text-ink dark:hover:text-white text-muted dark:text-slate-300"
                    >
                      Coluna
                    </button>
                  </>
                ) : null}
              </div>
            );
          })()}
        </div>
      ) : null}
    </NodeViewWrapper>
  );
}

export const TableBlock = TiptapNode.create({
  name: "tableBlock",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      rows: {
        default: emptyTableGrid(),
        parseHTML: (element) => {
          const raw = element.getAttribute("data-rows");
          if (raw) {
            try {
              const decoded = raw.startsWith("%") ? decodeURIComponent(raw) : raw;
              return JSON.parse(decoded);
            } catch {}
          }
          return emptyTableGrid();
        },
        renderHTML: (attributes) => ({
          "data-rows": JSON.stringify(attributes.rows || []),
        }),
      },
      hasColumnHeader: {
        default: true,
        parseHTML: (element) => element.getAttribute("data-has-column-header") !== "false",
        renderHTML: (attributes) => ({
          "data-has-column-header": String(Boolean(attributes.hasColumnHeader)),
        }),
      },
      colWidths: {
        default: [],
        parseHTML: (element) => {
          const raw = element.getAttribute("data-col-widths");
          if (raw) {
            try {
              return JSON.parse(raw);
            } catch {}
          }
          return [];
        },
        renderHTML: (attributes) => ({
          "data-col-widths": JSON.stringify(attributes.colWidths || []),
        }),
      },
      rowHeights: {
        default: [],
        parseHTML: (element) => {
          const raw = element.getAttribute("data-row-heights");
          if (raw) {
            try {
              return JSON.parse(raw);
            } catch {}
          }
          return [];
        },
        renderHTML: (attributes) => ({
          "data-row-heights": JSON.stringify(attributes.rowHeights || []),
        }),
      },
      cellAlignments: {
        default: [],
        parseHTML: (element) => {
          const raw = element.getAttribute("data-cell-alignments");
          if (raw) {
            try {
              return JSON.parse(raw);
            } catch {}
          }
          return [];
        },
        renderHTML: (attributes) => ({
          "data-cell-alignments": JSON.stringify(attributes.cellAlignments || []),
        }),
      },
    };
  },

  parseHTML() {
    return [
      { tag: 'div[data-type="table-block"]' },
      { tag: "div[data-table-block]" },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "table-block",
        "data-table-block": "",
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(TableView);
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("tableBlockDragDrop"),
        props: {
          handleDOMEvents: {
            dragstart(view, event) {
              const target = event.target as HTMLElement | null;
              const tableEl = target?.closest?.('[data-type="table-block"]') || target?.closest?.('[data-table-block]');
              let tablePos: number | null = null;
              if (tableEl) {
                const desc = (view as any).docView?.nearestDesc(tableEl, true);
                if (desc && desc.node?.type?.name === "tableBlock") {
                  tablePos = desc.posBefore;
                }
              }
              if (
                tablePos == null &&
                view.state.selection instanceof NodeSelection &&
                view.state.selection.node.type.name === "tableBlock"
              ) {
                tablePos = view.state.selection.from;
              }
              if (tablePos !== null) {
                activeDraggedTablePos = tablePos;
                const selection = NodeSelection.create(view.state.doc, tablePos);
                if (!view.state.selection.eq(selection)) {
                  view.dispatch(view.state.tr.setSelection(selection));
                }
                const slice = selection.content();
                (view as any).dragging = { slice, move: true, node: selection };
                if (event.dataTransfer) {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", "");
                }
              }
              return false;
            },
            dragend() {
              setTimeout(() => {
                activeDraggedTablePos = null;
              }, 100);
              return false;
            },
          },
          handleDrop(view, event) {
            let fromPos = activeDraggedTablePos;
            if (fromPos == null) {
              const draggingNode = (view as any).dragging?.node;
              if (draggingNode instanceof NodeSelection && draggingNode.node.type.name === "tableBlock") {
                fromPos = draggingNode.from;
              } else if (
                view.state.selection instanceof NodeSelection &&
                view.state.selection.node.type.name === "tableBlock"
              ) {
                fromPos = view.state.selection.from;
              }
            }

            if (fromPos == null) return false;

            activeDraggedTablePos = null;
            (view as any).dragging = null;

            const tableNode = view.state.doc.nodeAt(fromPos);
            if (!tableNode || tableNode.type.name !== "tableBlock") {
              return false;
            }

            const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
            if (!coords) return false;

            event.preventDefault();

            const tableSize = tableNode.nodeSize;
            if (coords.pos >= fromPos && coords.pos <= fromPos + tableSize) {
              return true;
            }

            const tableSlice = new Slice(Fragment.from(tableNode), 0, 0);
            const tr = view.state.tr;

            tr.delete(fromPos, fromPos + tableSize);

            const mapped = Math.max(0, Math.min(tr.doc.content.size, tr.mapping.map(coords.pos)));
            let insertPos = dropPoint(tr.doc, mapped, tableSlice);
            if (insertPos == null) {
              const $pos = tr.doc.resolve(mapped);
              insertPos = $pos.depth > 0 ? $pos.after(1) : mapped;
            }

            tr.insert(insertPos, tableNode);
            tr.setSelection(NodeSelection.create(tr.doc, insertPos));
            view.dispatch(tr.setMeta("uiEvent", "drop").scrollIntoView());
            view.focus();
            return true;
          },
        },
      }),
    ];
  },
});
