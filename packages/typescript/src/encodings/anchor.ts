import { a1 } from "../address.ts";
import { estimateTokens } from "../tokens.ts";
import type { AnchorDetection, AnchorJson, Encoding, Grid } from "../types.ts";

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

export function encodeAnchor(
  grid: Grid,
  detection: AnchorDetection,
): Encoding<AnchorJson> {
  const cells: AnchorJson["cells"] = [];
  const lines: string[] = [];

  for (let r = 0; r < grid.rows.length; r++) {
    if (!detection.keptRows.has(r)) continue;
    const row = grid.rows[r] ?? [];
    const tokens: string[] = [];
    for (let c = 0; c < row.length; c++) {
      if (!detection.keptCols.has(c)) continue;
      const value = row[c] ?? "";
      // SPEC §3.1: only literal "" is empty.
      if (value === "") continue;
      const address = a1(grid.origin.row + r, grid.origin.col + c);
      cells.push({ address, value });
      tokens.push(`${address},${escapeValue(value)}`);
    }
    // SPEC §3.2: fully-empty rows are dropped (no blank line emitted).
    if (tokens.length > 0) lines.push(tokens.join("|"));
  }

  const string = lines.join("\n");
  const json: AnchorJson = {
    encoding: "anchor-skeleton",
    version: 0,
    origin: { row: grid.origin.row, col: grid.origin.col },
    cells,
  };
  return { string, json, tokenEstimate: estimateTokens(string) };
}
