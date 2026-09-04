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

  const commit = (next: TableGrid, header = hasHeader) => {
    updateAttributes({ rows: next, hasColumnHeader: header });
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
    commit(cloneGrid(rows).map((row) => [...row, ""]));
  };

  const removeRow = (index: number) => {
    if (rows.length <= 1) return;
    commit(cloneGrid(rows).filter((_, i) => i !== index));
  };

  const removeCol = (index: number) => {
    if (colCount <= 1) return;
    commit(cloneGrid(rows).map((row) => row.filter((_, i) => i !== index)));
  };

  return (
    <NodeViewWrapper className="my-3" data-table-block>
      <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[var(--border)]">
        <table className="w-full border-collapse text-[0.92em]">
          {hasHeader && rows[0] ? (
            <thead>
              <tr>
                {rows[0].map((cell, col) => (
                  <th key={col} className="border-b border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-left font-medium">
                    {editable ? (
                      <input
                        value={cell}
                        onChange={(event) => setCell(0, col, event.target.value)}
                        className="w-full bg-transparent outline-none"
                        placeholder={`Coluna ${col + 1}`}
                      />
                    ) : (
                      cell
                    )}
                  </th>
                ))}
                {editable ? <th className="w-8 border-b border-[var(--border)] bg-[var(--surface-2)]" /> : null}
              </tr>
            </thead>
          ) : null}
          <tbody>
            {rows.slice(hasHeader ? 1 : 0).map((row, offset) => {
              const rowIndex = offset + (hasHeader ? 1 : 0);
              return (
                <tr key={rowIndex}>
                  {row.map((cell, col) => (
                    <td key={col} className="border-t border-[var(--border)] px-2 py-1.5 align-top">
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
                    </td>
                  ))}
                  {editable ? (
                    <td className="w-8 border-t border-[var(--border)]">
                      <button
                        type="button"
                        contentEditable={false}
                        title="Remover linha"
                        onClick={() => removeRow(rowIndex)}
                        className="flex size-7 items-center justify-center text-faint transition hover:text-[var(--danger)]"
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
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-muted" contentEditable={false}>
          <button type="button" onClick={addRow} className="inline-flex items-center gap-1 hover:text-ink">
            <Plus className="size-3" /> Linha
          </button>
          <button type="button" onClick={addCol} className="inline-flex items-center gap-1 hover:text-ink">
            <Plus className="size-3" /> Coluna
          </button>
          {colCount > 1 ? (
            <button type="button" onClick={() => removeCol(colCount - 1)} className="hover:text-ink">
              Remover última coluna
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => commit(cloneGrid(rows), !hasHeader)}
            className="hover:text-ink"
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
