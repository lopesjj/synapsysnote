import type { RichTextSpan, TableRow } from "@/types/models";

export type CellAlignment = {
  horizontal?: "left" | "center" | "right";
  vertical?: "top" | "middle" | "bottom";
};

export function toTableRows(
  grid: RichTextSpan[][][],
  alignments?: (CellAlignment | null)[][]
): TableRow[] {
  return grid.map((cells, r) => ({
    cells: cells.map((spans, c) => ({
      spans,
      ...(alignments?.[r]?.[c]?.horizontal ? { horizontalAlign: alignments[r][c]!.horizontal } : {}),
      ...(alignments?.[r]?.[c]?.vertical ? { verticalAlign: alignments[r][c]!.vertical } : {}),
    })),
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

export function fromTableRowsAlignments(rows?: TableRow[] | RichTextSpan[][][] | null): (CellAlignment | null)[][] {
  if (!rows?.length) return [];
  const first = rows[0] as TableRow | RichTextSpan[];
  if (first && !Array.isArray(first) && "cells" in first) {
    return (rows as TableRow[]).map((row) =>
      (row.cells ?? []).map((cell) => ({
        horizontal: cell.horizontalAlign,
        vertical: cell.verticalAlign,
      }))
    );
  }
  return [];
}
