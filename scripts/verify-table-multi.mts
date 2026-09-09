import assert from "node:assert/strict";
import type { TableGrid, CellAlignment } from "../src/components/editor/extensions/table-block";
import type { RichTextAnnotations, RichTextSpan } from "../src/types/models";

function cloneGrid(rows: TableGrid): TableGrid {
  return rows.map((row) => [...row]);
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

function applyMultiAlign(
  alignments: (CellAlignment | null)[][],
  coords: { row: number; col: number }[],
  hAlign?: "left" | "center" | "right",
  vAlign?: "top" | "middle" | "bottom"
): (CellAlignment | null)[][] {
  const next = alignments.map((row) => [...row]);
  for (const { row, col } of coords) {
    const cur = next[row]?.[col] ?? { horizontal: "left", vertical: "top" };
    next[row][col] = {
      ...cur,
      ...(hAlign ? { horizontal: hAlign } : {}),
      ...(vAlign ? { vertical: vAlign } : {}),
    };
  }
  return next;
}

console.log("Starting table multi-selection verification tests...");

const initialGrid: TableGrid = [
  [
    [{ text: "RAID 0" }],
    [{ text: "2" }],
    [{ text: "Nenhuma" }],
    [{ text: "Alta" }],
  ],
  [
    [{ text: "RAID 1" }],
    [{ text: "2" }],
    [{ text: "1 disco" }],
    [{ text: "Média" }],
  ],
  [
    [{ text: "RAID 5" }],
    [{ text: "3" }],
    [{ text: "1 disco" }],
    [{ text: "Média" }],
  ],
  [
    [{ text: "RAID 6" }],
    [{ text: "4" }],
    [{ text: "2 discos" }],
    [{ text: "Alta" }],
  ],
];

const selectedCoords = [
  { row: 1, col: 1 },
  { row: 1, col: 2 },
  { row: 2, col: 1 },
  { row: 2, col: 2 },
];

let grid = toggleMultiAnnotation(initialGrid, selectedCoords, "bold");
for (const { row, col } of selectedCoords) {
  assert.equal(grid[row][col][0].annotations?.bold, true, `Cell (${row}, ${col}) should be bold`);
}
assert.equal(grid[0][0][0].annotations?.bold, undefined, "Cell (0, 0) should remain unchanged");

grid = toggleMultiAnnotation(grid, selectedCoords, "bold");
for (const { row, col } of selectedCoords) {
  assert.equal(grid[row][col][0].annotations?.bold, undefined, `Cell (${row}, ${col}) bold should be removed`);
}
console.log("  ✓ Toggle annotation (bold) passed");

grid = applyMultiColor(initialGrid, selectedCoords, "#EF4444");
for (const { row, col } of selectedCoords) {
  assert.equal(grid[row][col][0].annotations?.color, "#EF4444", `Cell (${row}, ${col}) should have red color`);
}
grid = applyMultiColor(grid, selectedCoords, null);
for (const { row, col } of selectedCoords) {
  assert.equal(grid[row][col][0].annotations?.color, undefined, `Cell (${row}, ${col}) color should be unset`);
}
console.log("  ✓ Multi-cell text color passed");

grid = applyMultiHighlight(initialGrid, selectedCoords, "#FEF08A");
for (const { row, col } of selectedCoords) {
  assert.equal(grid[row][col][0].annotations?.highlight, "#FEF08A", `Cell (${row}, ${col}) should have yellow highlight`);
}
console.log("  ✓ Multi-cell highlight passed");

const initialAlignments: (CellAlignment | null)[][] = Array.from({ length: 4 }, () =>
  Array.from({ length: 4 }, () => ({ horizontal: "left" as const, vertical: "top" as const }))
);
const updatedAlignments = applyMultiAlign(initialAlignments, selectedCoords, "center", "middle");
for (const { row, col } of selectedCoords) {
  assert.equal(updatedAlignments[row][col]?.horizontal, "center", `Cell (${row}, ${col}) horizontal should be center`);
  assert.equal(updatedAlignments[row][col]?.vertical, "middle", `Cell (${row}, ${col}) vertical should be middle`);
}
assert.equal(updatedAlignments[0][0]?.horizontal, "left", "Cell (0,0) alignment should remain left");
console.log("  ✓ Multi-cell alignment passed");

const clearedGrid = clearMultiCells(initialGrid, selectedCoords);
for (const { row, col } of selectedCoords) {
  assert.deepEqual(clearedGrid[row][col], [], `Cell (${row}, ${col}) should be empty`);
}
assert.equal(clearedGrid[0][0][0].text, "RAID 0", "Unselected cell content must be preserved");
console.log("  ✓ Clear multi cells passed");

console.log("All table multi-selection verification tests passed successfully!");
