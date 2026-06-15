import type {
  AnchorDetection,
  AnchorStrategy,
  AnchorStrategyName,
  DataType,
  Grid,
} from "./types.ts";

/** SPEC §3.1: Phase-1 neighborhood window radius. */
const PHASE1_K = 4;
/** SPEC §3.1: Phase-1 heterogeneity threshold (unique ÷ non-empty). */
const PHASE1_HET_THRESHOLD = 0.5;

/**
 * SPEC §3.1: legacy "keep every cell" policy. Pre-Phase-1 default; retained
 * so callers can opt out of Phase-1 detection and as the simplest possible
 * conformance reference.
 */
export const keepAllStrategy: AnchorStrategy = {
  name: "keep-all",
  detect(grid: Grid): AnchorDetection {
    const rowCount = grid.rows.length;
    let colCount = 0;
    for (const row of grid.rows) {
      if (row.length > colCount) colCount = row.length;
    }
    const keptRows = new Set<number>();
    for (let r = 0; r < rowCount; r++) keptRows.add(r);
    const keptCols = new Set<number>();
    for (let c = 0; c < colCount; c++) keptCols.add(c);
    return { keptRows, keptCols };
  },
};

/**
 * SPEC §3.1: Phase-1 structural-anchor detection. Grid-only cues — per-row /
 * per-column value heterogeneity plus data-type transitions between adjacent
 * lines — feed a k-neighborhood keep window. Entirely-blank rows/columns
 * within the kept region are pruned in a final pass.
 */
export const phase1Strategy: AnchorStrategy = {
  name: "phase1",
  detect(grid: Grid): AnchorDetection {
    const rowCount = grid.rows.length;
    let colCount = 0;
    for (const row of grid.rows) {
      if (row.length > colCount) colCount = row.length;
    }
    if (rowCount === 0 || colCount === 0) {
      return { keptRows: new Set(), keptCols: new Set() };
    }

    const cell = (r: number, c: number): string => grid.rows[r]?.[c] ?? "";
    const type = (r: number, c: number): DataType => {
      const explicit = grid.cellMeta?.[r]?.[c]?.dataType;
      if (explicit) return explicit;
      return inferType(cell(r, c));
    };

    const anchorRows = new Set<number>();
    for (let r = 0; r < rowCount; r++) {
      const values: string[] = [];
      for (let c = 0; c < colCount; c++) values.push(cell(r, c));
      if (heterogeneity(values) >= PHASE1_HET_THRESHOLD) anchorRows.add(r);
    }
    for (let r = 1; r < rowCount; r++) {
      if (rowTypesDiffer(type, r - 1, r, colCount)) {
        anchorRows.add(r - 1);
        anchorRows.add(r);
      }
    }

    const anchorCols = new Set<number>();
    for (let c = 0; c < colCount; c++) {
      const values: string[] = [];
      for (let r = 0; r < rowCount; r++) values.push(cell(r, c));
      if (heterogeneity(values) >= PHASE1_HET_THRESHOLD) anchorCols.add(c);
    }
    for (let c = 1; c < colCount; c++) {
      if (colTypesDiffer(type, c - 1, c, rowCount)) {
        anchorCols.add(c - 1);
        anchorCols.add(c);
      }
    }

    const keptRows = expandNeighborhood(anchorRows, rowCount, PHASE1_K);
    const keptCols = expandNeighborhood(anchorCols, colCount, PHASE1_K);

    // Prune entirely-blank rows/cols within the kept region.
    for (const r of [...keptRows]) {
      let hasContent = false;
      for (const c of keptCols) {
        if (cell(r, c) !== "") {
          hasContent = true;
          break;
        }
      }
      if (!hasContent) keptRows.delete(r);
    }
    for (const c of [...keptCols]) {
      let hasContent = false;
      for (const r of keptRows) {
        if (cell(r, c) !== "") {
          hasContent = true;
          break;
        }
      }
      if (!hasContent) keptCols.delete(c);
    }

    return { keptRows, keptCols };
  },
};

const NUMERIC_RE = /^-?\d+(\.\d+)?$/;

/**
 * SPEC §3.1: when `cellMeta.dataType` is absent we infer from the raw text.
 * Only three buckets in v0 so every language agrees byte-for-byte: empty,
 * a strict decimal, or text.
 */
function inferType(value: string): DataType {
  if (value === "") return "empty";
  if (NUMERIC_RE.test(value)) return "number";
  return "text";
}

function heterogeneity(values: string[]): number {
  let nonEmpty = 0;
  const seen = new Set<string>();
  for (const v of values) {
    if (v === "") continue;
    nonEmpty++;
    seen.add(v);
  }
  if (nonEmpty === 0) return 0;
  return seen.size / nonEmpty;
}

function rowTypesDiffer(
  type: (r: number, c: number) => DataType,
  rA: number,
  rB: number,
  colCount: number,
): boolean {
  for (let c = 0; c < colCount; c++) {
    if (type(rA, c) !== type(rB, c)) return true;
  }
  return false;
}

function colTypesDiffer(
  type: (r: number, c: number) => DataType,
  cA: number,
  cB: number,
  rowCount: number,
): boolean {
  for (let r = 0; r < rowCount; r++) {
    if (type(r, cA) !== type(r, cB)) return true;
  }
  return false;
}

function expandNeighborhood(
  anchors: ReadonlySet<number>,
  size: number,
  k: number,
): Set<number> {
  const kept = new Set<number>();
  for (const a of anchors) {
    const lo = Math.max(0, a - k);
    const hi = Math.min(size - 1, a + k);
    for (let i = lo; i <= hi; i++) kept.add(i);
  }
  return kept;
}

export function resolveStrategy(
  s: AnchorStrategyName | AnchorStrategy | undefined,
): AnchorStrategy {
  if (s === undefined) return phase1Strategy;
  if (typeof s === "string") {
    switch (s) {
      case "keep-all":
        return keepAllStrategy;
      case "phase1":
        return phase1Strategy;
    }
  }
  return s;
}
