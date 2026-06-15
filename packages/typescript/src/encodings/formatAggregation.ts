import { a1 } from "../address.ts";
import { estimateTokens } from "../tokens.ts";
import type {
  Encoding,
  FormatAggregationJson,
  FormatType,
  Grid,
  Origin,
} from "../types.ts";

/**
 * Canonical emission order for format-aggregation groups. The classifier may
 * encounter types in any order; the encoder always emits groups in THIS order
 * (omitting types with no ranges), independent of which row/col surfaced them.
 *
 * Keeping the order fixed here is what makes the encoding deterministic across
 * runs and languages — every port MUST emit groups in the same order.
 */
const TYPE_ORDER: readonly FormatType[] = [
  "IntNum",
  "FloatNum",
  "ScientificNum",
  "PercentageNum",
  "CurrencyData",
  "DateData",
  "TimeData",
  "YearData",
  "EmailData",
  "Boolean",
  "Text",
] as const;

/**
 * Classification patterns, applied in priority order. The first match wins, so
 * more-specific patterns are listed first. Examples that drive the ordering:
 *   - "1900" matches both Year and Int — Year is more specific, must run first
 *   - "1.5e10" matches both Scientific and (loosely) Float — Scientific first
 *   - "$5" matches Currency, not Int — Currency comes before the numeric fallbacks
 */
const BOOLEAN = /^(?:true|false)$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SCIENTIFIC = /^-?\d+(?:\.\d+)?[eE][+-]?\d+$/;
const PERCENT = /^-?\d+(?:\.\d+)?%$/;
const CURRENCY = /^-?[$€£¥]\d+(?:\.\d+)?$/;
const DATE_ISO = /^\d{4}-\d{1,2}-\d{1,2}$/;
const DATE_SLASH = /^\d{1,2}\/\d{1,2}\/\d{2,4}$/;
const DATE_DASH = /^\d{1,2}-\d{1,2}-\d{2,4}$/;
const TIME_12 = /^\d{1,2}:\d{2}(?::\d{2})?\s?(?:AM|PM|am|pm)$/;
const TIME_24 = /^\d{1,2}:\d{2}(?::\d{2})?$/;
const YEAR = /^(?:19|20)\d{2}$/;
const FLOAT = /^-?(?:\d+\.\d*|\.\d+)$/;
const INT = /^-?\d+$/;

/**
 * Classify a single cell value into a format-aggregation category. Returns
 * `null` for the empty string (the only value considered empty per SPEC §3.1).
 */
export function classify(v: string): FormatType | null {
  if (v === "") return null;
  if (BOOLEAN.test(v)) return "Boolean";
  if (EMAIL.test(v)) return "EmailData";
  if (SCIENTIFIC.test(v)) return "ScientificNum";
  if (PERCENT.test(v)) return "PercentageNum";
  if (CURRENCY.test(v)) return "CurrencyData";
  if (DATE_ISO.test(v) || DATE_SLASH.test(v) || DATE_DASH.test(v))
    return "DateData";
  if (TIME_12.test(v) || TIME_24.test(v)) return "TimeData";
  if (YEAR.test(v)) return "YearData";
  if (FLOAT.test(v)) return "FloatNum";
  if (INT.test(v)) return "IntNum";
  return "Text";
}

type Rect = {
  type: FormatType;
  topRow: number;
  leftCol: number;
  bottomRow: number;
  rightCol: number;
};

/**
 * Greedy rectangular aggregation: scan the type map in row-major order; for
 * each unclaimed non-empty cell, extend as far right as the row's same-type
 * run goes, then extend down as long as every row below matches that full
 * width. Mark the rectangle's cells claimed and continue. Empty cells break
 * runs (no aggregation across gaps).
 */
function aggregate(grid: Grid): Rect[] {
  const numRows = grid.rows.length;
  let numCols = 0;
  for (const row of grid.rows) {
    if (row.length > numCols) numCols = row.length;
  }
  if (numRows === 0 || numCols === 0) return [];

  const types: (FormatType | null)[][] = [];
  for (let r = 0; r < numRows; r++) {
    const row = grid.rows[r] ?? [];
    const typeRow: (FormatType | null)[] = new Array(numCols).fill(null);
    for (let c = 0; c < numCols; c++) {
      typeRow[c] = classify(row[c] ?? "");
    }
    types.push(typeRow);
  }

  const claimed: boolean[][] = Array.from({ length: numRows }, () =>
    new Array<boolean>(numCols).fill(false),
  );

  const rects: Rect[] = [];

  for (let r = 0; r < numRows; r++) {
    const typeRow = types[r]!;
    const claimedRow = claimed[r]!;
    for (let c = 0; c < numCols; c++) {
      if (claimedRow[c]) continue;
      const t = typeRow[c];
      if (t == null) continue;

      // Extend right along row r.
      let w = 1;
      while (c + w < numCols && typeRow[c + w] === t && !claimedRow[c + w]) {
        w++;
      }

      // Extend down: each candidate row must be fully same-type AND unclaimed
      // across the [c, c+w) span.
      let h = 1;
      extendDown: while (r + h < numRows) {
        const nextTypes = types[r + h]!;
        const nextClaimed = claimed[r + h]!;
        for (let cc = c; cc < c + w; cc++) {
          if (nextTypes[cc] !== t || nextClaimed[cc]) break extendDown;
        }
        h++;
      }

      for (let rr = r; rr < r + h; rr++) {
        const cl = claimed[rr]!;
        for (let cc = c; cc < c + w; cc++) cl[cc] = true;
      }

      rects.push({
        type: t,
        topRow: r,
        leftCol: c,
        bottomRow: r + h - 1,
        rightCol: c + w - 1,
      });
    }
  }

  return rects;
}

function rectToRange(rect: Rect, origin: Origin): string {
  const topLeft = a1(origin.row + rect.topRow, origin.col + rect.leftCol);
  if (rect.topRow === rect.bottomRow && rect.leftCol === rect.rightCol) {
    return topLeft;
  }
  const bottomRight = a1(
    origin.row + rect.bottomRow,
    origin.col + rect.rightCol,
  );
  return `${topLeft}:${bottomRight}`;
}

export function encodeFormatAggregation(
  grid: Grid,
): Encoding<FormatAggregationJson> {
  const rects = aggregate(grid);

  const byType = new Map<FormatType, string[]>();
  for (const rect of rects) {
    const ranges = byType.get(rect.type) ?? [];
    ranges.push(rectToRange(rect, grid.origin));
    byType.set(rect.type, ranges);
  }

  const groups: FormatAggregationJson["groups"] = [];
  for (const t of TYPE_ORDER) {
    const ranges = byType.get(t);
    if (!ranges || ranges.length === 0) continue;
    groups.push({ type: t, ranges });
  }

  const string = groups
    .map((g) => `${g.type}: ${g.ranges.join(",")}`)
    .join("\n");

  const json: FormatAggregationJson = {
    encoding: "format-aggregation",
    version: 0,
    origin: { row: grid.origin.row, col: grid.origin.col },
    groups,
  };

  return { string, json, tokenEstimate: estimateTokens(string) };
}
