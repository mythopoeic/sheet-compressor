import { describe, expect, it } from "vitest";

import { compress } from "../src/compress.ts";
import { loadFixtures } from "../src/fixtures.ts";
import {
  keepAllStrategy,
  phase1Strategy,
  resolveStrategy,
} from "../src/strategies.ts";
import type { AnchorStrategy, Grid } from "../src/index.ts";

const sparse: Grid = {
  origin: { row: 1, col: 1 },
  rows: [
    ["A", "B", "C", "", "", "", ""],
    ["1", "2", "3", "", "", "", ""],
    ...Array.from({ length: 16 }, () => Array(7).fill("") as string[]),
    ["", "", "", "", "", "", "Total"],
    ["", "", "", "", "", "", "8"],
  ],
};

describe("anchor strategy interface", () => {
  it("resolves the default to phase1", () => {
    expect(resolveStrategy(undefined).name).toBe("phase1");
  });

  it("resolves named built-ins", () => {
    expect(resolveStrategy("keep-all")).toBe(keepAllStrategy);
    expect(resolveStrategy("phase1")).toBe(phase1Strategy);
  });

  it("accepts a custom strategy object", () => {
    const custom: AnchorStrategy = {
      name: "row-zero-only",
      detect: () => ({ keptRows: new Set([0]), keptCols: new Set([0]) }),
    };
    const { encodings } = compress(
      { origin: { row: 1, col: 1 }, rows: [["X", "Y"], ["Z", "W"]] },
      { anchorStrategy: custom },
    );
    expect(encodings.anchor.string).toBe("A1,X");
  });
});

describe("keep-all strategy", () => {
  it("keeps every row and column from the sparse fixture", () => {
    const { keptRows, keptCols } = keepAllStrategy.detect(sparse);
    expect(keptRows.size).toBe(sparse.rows.length);
    expect(keptCols.size).toBe(7);
  });

  it("emits the un-pruned skeleton through compress()", () => {
    const { encodings } = compress(sparse, { anchorStrategy: "keep-all" });
    // Header + numbers row near the top, total/8 in the bottom-right corner,
    // and middle empty rows simply dropped because they have no non-empty cells.
    expect(encodings.anchor.string).toBe(
      [
        "A1,A|B1,B|C1,C",
        "A2,1|B2,2|C2,3",
        "G19,Total",
        "G20,8",
      ].join("\n"),
    );
  });
});

describe("phase1 strategy — anchor detection", () => {
  it("flags a row as an anchor on value heterogeneity", () => {
    const grid: Grid = {
      origin: { row: 1, col: 1 },
      rows: [["a", "b", "c", "d"]],
    };
    const { keptRows } = phase1Strategy.detect(grid);
    expect([...keptRows]).toEqual([0]);
  });

  it("does NOT flag a homogeneous row on heterogeneity alone", () => {
    // Single row, every value identical: heterogeneity = 1/4 = 0.25 < 0.5
    // and no adjacent row to drive a type transition, so no anchor.
    const grid: Grid = {
      origin: { row: 1, col: 1 },
      rows: [["x", "x", "x", "x"]],
    };
    const { keptRows } = phase1Strategy.detect(grid);
    expect(keptRows.size).toBe(0);
  });

  it("flags both sides of a data-type transition as anchors", () => {
    // Each row alone has heterogeneity 1/4 = 0.25, below the 0.5 threshold,
    // so only the text→number transition between them can promote them.
    const grid: Grid = {
      origin: { row: 1, col: 1 },
      rows: [
        ["x", "x", "x", "x"],
        ["1", "1", "1", "1"],
      ],
    };
    const { keptRows } = phase1Strategy.detect(grid);
    expect([...keptRows].sort()).toEqual([0, 1]);
  });

  it("expands kept rows by the k-neighborhood window (k=4)", () => {
    // 12 rows: only the first is "interesting"; with k=4, rows 0..4 stay,
    // but the trailing empty rows get pruned in the blank-row pass.
    const grid: Grid = {
      origin: { row: 1, col: 1 },
      rows: [
        ["A", "B", "C", "D"],
        ...Array.from({ length: 11 }, () => ["", "", "", ""]),
      ],
    };
    const { keptRows } = phase1Strategy.detect(grid);
    expect([...keptRows]).toEqual([0]);
  });

  it("prunes interior empty rows in a sparse sheet", () => {
    const { keptRows } = phase1Strategy.detect(sparse);
    // Top data rows + bottom Total/8 rows survive; the 16-row empty interior
    // is pruned out by the blank-row pass even though k-window touches some
    // of it from both ends.
    expect([...keptRows].sort((a, b) => a - b)).toEqual([0, 1, 18, 19]);
  });

  it("prunes empty columns in a sparse sheet", () => {
    const { keptCols } = phase1Strategy.detect(sparse);
    // Header cols 0..2 hold the table; col 6 holds Total/8; the empty
    // interior cols 3..5 are pruned even though k=4 would touch them.
    expect([...keptCols].sort((a, b) => a - b)).toEqual([0, 1, 2, 6]);
  });

  it("compresses the sparse fixture to the pruned skeleton by default", () => {
    const { encodings } = compress(sparse);
    expect(encodings.anchor.string).toBe(
      [
        "A1,A|B1,B|C1,C",
        "A2,1|B2,2|C2,3",
        "G19,Total",
        "G20,8",
      ].join("\n"),
    );
  });

  it("returns an empty detection for a wholly-empty grid", () => {
    const { keptRows, keptCols } = phase1Strategy.detect({
      origin: { row: 1, col: 1 },
      rows: [],
    });
    expect(keptRows.size).toBe(0);
    expect(keptCols.size).toBe(0);
  });

  it("uses cellMeta.dataType when present in place of inference", () => {
    // Both rows look identical as raw text ("1","2") — without metadata,
    // numeric inference would put them in the same `number` bucket and no
    // type transition would fire. Marking row 0 as `text` via cellMeta
    // forces a transition with row 1's inferred `number`, promoting both
    // rows to anchors.
    const grid: Grid = {
      origin: { row: 1, col: 1 },
      rows: [
        ["1", "2"],
        ["3", "4"],
      ],
      cellMeta: [
        [{ dataType: "text" }, { dataType: "text" }],
        [{}, {}],
      ],
    };
    const { keptRows } = phase1Strategy.detect(grid);
    expect([...keptRows].sort()).toEqual([0, 1]);
  });
});

// issue #23 — these fixtures EXIST to lock specific phase-1 behaviors. The
// conformance suite already byte-diffs the goldens; these tests pin the
// *intent* so a future fixture edit that erodes the coverage purpose (e.g.
// shrinks phase1-lossy until pruning no longer fires) fails loudly here.
describe("phase1 fixtures lock the lossy + multi-table behaviors (issue #23)", () => {
  const fixtures = new Map(loadFixtures().map((fx) => [fx.id, fx]));

  it("phase1-lossy: skeleton is materially smaller than the input", () => {
    const fx = fixtures.get("phase1-lossy");
    if (!fx) throw new Error("fixture phase1-lossy missing");
    const { keptRows, keptCols } = phase1Strategy.detect(fx.input);
    const inputRows = fx.input.rows.length;
    const inputCols = Math.max(...fx.input.rows.map((r) => r.length));
    // The whole point of the fixture: phase-1 drops the homogeneous bulk.
    // Lock that the skeleton is at most half the rows AND half the cols.
    expect(keptRows.size).toBeLessThanOrEqual(inputRows / 2);
    expect(keptCols.size).toBeLessThanOrEqual(inputCols / 2);
    // And specifically smaller than the input on at least one axis by 10+.
    expect(inputRows - keptRows.size).toBeGreaterThanOrEqual(10);
    expect(inputCols - keptCols.size).toBeGreaterThanOrEqual(5);
  });

  it("multi-table: keeps both tables and prunes the blank gap between them", () => {
    const fx = fixtures.get("multi-table");
    if (!fx) throw new Error("fixture multi-table missing");
    const { keptRows } = phase1Strategy.detect(fx.input);
    // Both tables sit at rows 0-3 and 14-17 — phase-1 must keep both regions.
    for (const r of [0, 1, 2, 3, 14, 15, 16, 17]) {
      expect(keptRows.has(r)).toBe(true);
    }
    // The blank band between the tables (rows 4..13) MUST be pruned, otherwise
    // the fixture isn't proving multi-table separation — it's just keeping all.
    for (const r of [4, 5, 6, 7, 8, 9, 10, 11, 12, 13]) {
      expect(keptRows.has(r)).toBe(false);
    }
  });
});
