import { a1 } from "../address.ts";
import { estimateTokens } from "../tokens.ts";
import type { AnchorJson, Encoding, Grid } from "../types.ts";

/**
 * Per SPEC §3.2: backslash first (so later rules' backslashes aren't
 * double-escaped), then the delimiters, then the whitespace controls.
 */
function escapeValue(v: string): string {
  return v
    .replace(/\\/g, "\\\\")
    .replace(/,/g, "\\,")
    .replace(/\|/g, "\\|")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}

type Cell = { address: string; value: string };

function extractCells(grid: Grid): Cell[] {
  const out: Cell[] = [];
  for (let r = 0; r < grid.rows.length; r++) {
    const row = grid.rows[r] ?? [];
    for (let c = 0; c < row.length; c++) {
      const value = row[c] ?? "";
      // SPEC §3.1: only literal "" is empty.
      if (value === "") continue;
      out.push({
        address: a1(grid.origin.row + r, grid.origin.col + c),
        value,
      });
    }
  }
  return out;
}

function renderString(cells: Cell[]): string {
  // Group consecutive cells by their row component so `|`-joined runs match
  // the source grid row layout. SPEC §3.2: fully-empty rows are dropped, no
  // trailing newline, row-major order.
  const lines: string[] = [];
  let currentRowKey: string | null = null;
  let currentTokens: string[] = [];

  const flush = () => {
    if (currentTokens.length > 0) lines.push(currentTokens.join("|"));
    currentTokens = [];
  };

  for (const cell of cells) {
    // The row portion of the address is the trailing digits.
    const rowKey = cell.address.replace(/^[A-Z]+/, "");
    if (rowKey !== currentRowKey) {
      flush();
      currentRowKey = rowKey;
    }
    currentTokens.push(`${cell.address},${escapeValue(cell.value)}`);
  }
  flush();
  return lines.join("\n");
}

export function encodeAnchor(grid: Grid): Encoding<AnchorJson> {
  const cells = extractCells(grid);
  const string = renderString(cells);
  const json: AnchorJson = {
    encoding: "anchor-skeleton",
    version: 0,
    origin: { row: grid.origin.row, col: grid.origin.col },
    cells,
  };
  return { string, json, tokenEstimate: estimateTokens(string) };
}
