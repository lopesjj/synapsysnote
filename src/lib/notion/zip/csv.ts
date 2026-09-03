import { nanoid } from "nanoid";
import type { AppBlock, RichTextSpan } from "@/types/models";
import { parseInline } from "./markdown";

/**
 * Notion database CSV → a table block.
 *
 * The export writes one `.csv` per database next to a folder holding each row
 * as its own Markdown page. Those row pages are imported as normal notes by the
 * archive walker; the CSV is what preserves the *view* — column order and the
 * values that only existed as properties — so it is rendered as a table block
 * on the database's own page.
 *
 * Written by hand rather than pulled from a dependency because the format is
 * plain RFC 4180: comma separated, double-quoted fields, `""` for an embedded
 * quote, and newlines allowed inside quotes.
 */

export function parseCsv(source: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  const text = source.replace(/\r\n?/g, "\n");
  // Strip a UTF-8 BOM: Notion emits one and it would otherwise become part of
  // the first column's name.
  const start = text.charCodeAt(0) === 0xfeff ? 1 : 0;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    // Ignore the trailing newline's empty row.
    if (row.length > 1 || row[0] !== "") rows.push(row);
    row = [];
  };

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && field === "") quoted = true;
    else if (char === ",") endField();
    else if (char === "\n") endRow();
    else field += char;
  }

  if (field !== "" || row.length) endRow();
  return rows;
}

export interface ParsedCsv {
  columns: string[];
  rows: string[][];
  blocks: AppBlock[];
}

/** Converts a database CSV into a header-first table block. */
export function csvToBlocks(source: string): ParsedCsv {
  const grid = parseCsv(source);
  if (!grid.length) return { columns: [], rows: [], blocks: [] };

  const [columns, ...rows] = grid;
  const tableRows: RichTextSpan[][][] = grid.map((line) =>
    line.map((cell) => (cell ? parseInline(cell) : [{ text: "" }]))
  );

  return {
    columns,
    rows,
    blocks: [
      {
        id: `blk_${nanoid(8)}`,
        type: "table",
        props: { tableRows, hasColumnHeader: true },
      },
    ],
  };
}
