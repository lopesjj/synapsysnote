"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { Plus, Trash2 } from "lucide-react";

export type TableGrid = string[][];

export function emptyTableGrid(rows = 3, cols = 3): TableGrid {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => ""));
}

function cloneGrid(rows: TableGrid): TableGrid {
  return rows.map((row) => [...row]);
}

function TableView({ node, updateAttributes, editor }: NodeViewProps) {
  const rows = (node.attrs.rows as TableGrid) ?? emptyTableGrid();
  const hasHeader = Boolean(node.attrs.hasColumnHeader);
  const editable = editor.isEditable;
  const colCount = Math.max(1, ...rows.map((row) => row.length));
  const rawColWidths = (node.attrs.colWidths as number[]) ?? [];
  const colWidths = Array.from({ length: colCount }, (_, i) => rawColWidths[i] || 150);

  const commit = (next: TableGrid, nextWidths = colWidths, header = hasHeader) => {
    updateAttributes({ rows: next, colWidths: nextWidths, hasColumnHeader: header });
  };

  const setCell = (row: number, col: number, value: string) => {
    const next = cloneGrid(rows);
    next[row][col] = value;
    commit(next);
  };

  const addRow = () => {
    commit([...cloneGrid(rows), Array.from({ length: colCount }, () => "")]);
  };

  const addCol = () => {
    commit(
      cloneGrid(rows).map((row) => [...row, ""]),
      [...colWidths, 150]
    );
  };

  const removeRow = (index: number) => {
    if (rows.length <= 1) return;
    commit(cloneGrid(rows).filter((_, i) => i !== index));
  };

  const removeCol = (index: number) => {
    if (colCount <= 1) return;
    commit(
      cloneGrid(rows).map((row) => row.filter((_, i) => i !== index)),
      colWidths.filter((_, i) => i !== index)
    );
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
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  return (
    <NodeViewWrapper className="my-3" data-table-block>
      <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[var(--border)]">
        <table className="w-full border-collapse text-[0.92em]" style={{ tableLayout: "fixed" }}>
          <colgroup>
            {colWidths.map((width, i) => (
              <col key={i} style={{ width: `${width}px`, minWidth: "60px" }} />
            ))}
            {editable ? <col style={{ width: "36px" }} /> : null}
          </colgroup>
          {hasHeader && rows[0] ? (
            <thead>
              <tr>
                {rows[0].map((cell, col) => (
                  <th
                    key={col}
                    className="relative border-b border-r border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-left font-medium select-none"
                  >
                    {editable ? (
                      <input
                        value={cell}
                        onChange={(event) => setCell(0, col, event.target.value)}
                        className="w-full bg-transparent outline-none font-medium"
                        placeholder={`Coluna ${col + 1}`}
                      />
                    ) : (
                      cell
                    )}
                    {editable ? (
                      <div
                        onMouseDown={(e) => onResizeStart(col, e)}
                        className="absolute right-0 top-0 bottom-0 w-2.5 translate-x-1 cursor-col-resize select-none z-10 hover:bg-[var(--accent)] active:bg-[var(--accent)] transition-colors opacity-0 hover:opacity-100"
                        title="Arrastar para redimensionar coluna"
                      />
                    ) : null}
                  </th>
                ))}
                {editable ? (
                  <th className="w-9 border-b border-[var(--border)] bg-[var(--surface-2)]" />
                ) : null}
              </tr>
            </thead>
          ) : null}
          <tbody>
            {rows.slice(hasHeader ? 1 : 0).map((row, offset) => {
              const rowIndex = offset + (hasHeader ? 1 : 0);
              return (
                <tr key={rowIndex}>
                  {row.map((cell, col) => (
                    <td
                      key={col}
                      className="relative border-t border-r border-[var(--border)] px-2 py-1.5 align-top"
                    >
                      {editable ? (
                        <input
                          value={cell}
                          onChange={(event) => setCell(rowIndex, col, event.target.value)}
                          className="w-full bg-transparent outline-none"
                          placeholder="…"
                        />
                      ) : (
                        cell
                      )}
                      {editable && !hasHeader && rowIndex === 0 ? (
                        <div
                          onMouseDown={(e) => onResizeStart(col, e)}
                          className="absolute right-0 top-0 bottom-0 w-2.5 translate-x-1 cursor-col-resize select-none z-10 hover:bg-[var(--accent)] active:bg-[var(--accent)] transition-colors opacity-0 hover:opacity-100"
                          title="Arrastar para redimensionar coluna"
                        />
                      ) : null}
                    </td>
                  ))}
                  {editable ? (
                    <td className="w-9 border-t border-[var(--border)] text-center align-middle">
                      <button
                        type="button"
                        contentEditable={false}
                        title="Remover linha"
                        onClick={() => removeRow(rowIndex)}
                        className="mx-auto flex size-7 items-center justify-center rounded text-faint transition hover:bg-[var(--surface-hover)] hover:text-[var(--danger)]"
                      >
                        <Trash2 className="size-3" />
                      </button>
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
          className="mt-1.5 flex flex-wrap items-center gap-3 text-[11.5px] text-muted"
          contentEditable={false}
        >
          <button
            type="button"
            onClick={addRow}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-[var(--surface-hover)] hover:text-ink"
          >
            <Plus className="size-3" /> Linha
          </button>
          <button
            type="button"
            onClick={addCol}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-[var(--surface-hover)] hover:text-ink"
          >
            <Plus className="size-3" /> Coluna
          </button>
          {colCount > 1 ? (
            <button
              type="button"
              onClick={() => removeCol(colCount - 1)}
              className="rounded px-1.5 py-0.5 hover:bg-[var(--surface-hover)] hover:text-ink"
            >
              Remover última coluna
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => commit(cloneGrid(rows), colWidths, !hasHeader)}
            className="rounded px-1.5 py-0.5 hover:bg-[var(--surface-hover)] hover:text-ink"
          >
            {hasHeader ? "Sem cabeçalho" : "Com cabeçalho"}
          </button>
        </div>
      ) : null}
    </NodeViewWrapper>
  );
}

export const TableBlock = Node.create({
  name: "tableBlock",
  group: "block",
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      rows: { default: emptyTableGrid() },
      hasColumnHeader: { default: true },
      colWidths: { default: [] },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="table-block"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "table-block" })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(TableView);
  },
});
