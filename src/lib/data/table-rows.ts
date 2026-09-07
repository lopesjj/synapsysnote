import type { RichTextSpan, TableRow } from "@/types/models";

export function toTableRows(grid: RichTextSpan[][][]): TableRow[] {
  return grid.map((cells) => ({
    cells: cells.map((spans) => ({ spans })),
  }));
}

export function fromTableRows(rows?: TableRow[] | RichTextSpan[][][] | null): RichTextSpan[][][] {
  if (!rows?.length) return [];
  const first = rows[0] as TableRow | RichTextSpan[];
  if (first && !Array.isArray(first) && "cells" in first) {
    return (rows as TableRow[]).map((row) => (row.cells ?? []).map((cell) => cell.spans ?? []));
  }
  return rows as RichTextSpan[][][];
}
