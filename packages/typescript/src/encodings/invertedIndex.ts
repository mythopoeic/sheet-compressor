import { a1 } from "../address.ts";
import { estimateTokens } from "../tokens.ts";
import type { Encoding, Grid, InvertedIndexJson } from "../types.ts";
import { escapeValue } from "./escape.ts";

/** Pack absolute (row, col) into a single number for Map/Set keys. */
function pack(row: number, col: number): number {
  return row * 0x100000 + col;
}

/**
 * Inverted-index encoding per SPEC §4: group cells by value, then collapse
 * each group's cells into the minimal list of A1 rectangles via a deterministic
 * width-first greedy scan over row-major order.
 */
export function encodeInvertedIndex(grid: Grid): Encoding<InvertedIndexJson> {
  // Walk the grid in row-major order, bucketing every non-empty cell by value
  // and remembering each value's first-seen ordinal so the output is ordered
  // by first cell address (SPEC §4.4).
  const cellsByValue = new Map<string, number[]>();
  const firstSeen = new Map<string, number>();
  let ordinal = 0;

  for (let r = 0; r < grid.rows.length; r++) {
    const row = grid.rows[r] ?? [];
    for (let c = 0; c < row.length; c++) {
      const value = row[c] ?? "";
      if (value === "") continue;
      const key = pack(grid.origin.row + r, grid.origin.col + c);
      const bucket = cellsByValue.get(value);
      if (bucket === undefined) {
        cellsByValue.set(value, [key]);
        firstSeen.set(value, ordinal++);
      } else {
        bucket.push(key);
      }
    }
  }

  const values = [...cellsByValue.keys()].sort(
    (a, b) => (firstSeen.get(a) ?? 0) - (firstSeen.get(b) ?? 0),
  );

  const groups: InvertedIndexJson["groups"] = [];
  for (const value of values) {
    const cellKeys = cellsByValue.get(value) ?? [];
    const present = new Set(cellKeys);
    const assigned = new Set<number>();
    const ranges: string[] = [];

    for (const startKey of cellKeys) {
      if (assigned.has(startKey)) continue;
      const startRow = Math.floor(startKey / 0x100000);
      const startCol = startKey % 0x100000;

      // Maximum width: extend right while cells are in the value-set AND
      // not already absorbed by an earlier rectangle from a row above.
      let width = 1;
      while (
        present.has(pack(startRow, startCol + width)) &&
        !assigned.has(pack(startRow, startCol + width))
      ) {
        width++;
      }

      // Maximum height: extend down while every cell in the row of `width`
      // cells is still in the value-set and unassigned.
      let height = 1;
      while (true) {
        const nextRow = startRow + height;
        let canExtend = true;
        for (let dc = 0; dc < width; dc++) {
          const k = pack(nextRow, startCol + dc);
          if (!present.has(k) || assigned.has(k)) {
            canExtend = false;
            break;
          }
        }
        if (!canExtend) break;
        height++;
      }

      for (let dr = 0; dr < height; dr++) {
        for (let dc = 0; dc < width; dc++) {
          assigned.add(pack(startRow + dr, startCol + dc));
        }
      }

      const topLeft = a1(startRow, startCol);
      if (width === 1 && height === 1) {
        ranges.push(topLeft);
      } else {
        ranges.push(
          `${topLeft}:${a1(startRow + height - 1, startCol + width - 1)}`,
        );
      }
    }

    groups.push({ value, ranges });
  }

  const string = groups
    .map((g) => `${g.ranges.join("|")},${escapeValue(g.value)}`)
    .join("\n");

  const json: InvertedIndexJson = {
    encoding: "inverted-index",
    version: 0,
    origin: { row: grid.origin.row, col: grid.origin.col },
    groups,
  };
  return { string, json, tokenEstimate: estimateTokens(string) };
}
