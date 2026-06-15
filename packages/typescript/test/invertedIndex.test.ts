import { describe, expect, it } from "vitest";
import { compress } from "../src/index.ts";
import type { Grid } from "../src/index.ts";

describe("compress() — inverted-index encoding, v0", () => {
  it("emits the spec example string verbatim", () => {
    const grid: Grid = {
      origin: { row: 1, col: 1 },
      rows: [
        ["X", "X", ""],
        ["X", "Y", "Y"],
        ["", "Y", ""],
      ],
    };
    const { encodings } = compress(grid);
    expect(encodings.invertedIndex.string).toBe(
      ["A1:B1|A2,X", "B2:C2|B3,Y"].join("\n"),
    );
  });

  it("emits the spec example JSON shape", () => {
    const grid: Grid = {
      origin: { row: 1, col: 1 },
      rows: [
        ["X", "X", ""],
        ["X", "Y", "Y"],
        ["", "Y", ""],
      ],
    };
    const { encodings } = compress(grid);
    expect(encodings.invertedIndex.json).toEqual({
      encoding: "inverted-index",
      version: 0,
      origin: { row: 1, col: 1 },
      groups: [
        { value: "X", ranges: ["A1:B1", "A2"] },
        { value: "Y", ranges: ["B2:C2", "B3"] },
      ],
    });
  });

  it("renders a single cell as just its address, not address:address", () => {
    const grid: Grid = {
      origin: { row: 1, col: 1 },
      rows: [["lonely"]],
    };
    expect(compress(grid).encodings.invertedIndex.string).toBe("A1,lonely");
  });

  it("merges a horizontal run", () => {
    const grid: Grid = {
      origin: { row: 1, col: 1 },
      rows: [["X", "X", "X"]],
    };
    const { encodings } = compress(grid);
    expect(encodings.invertedIndex.string).toBe("A1:C1,X");
  });

  it("merges a vertical run", () => {
    const grid: Grid = {
      origin: { row: 1, col: 1 },
      rows: [["X"], ["X"], ["X"]],
    };
    expect(compress(grid).encodings.invertedIndex.string).toBe("A1:A3,X");
  });

  it("merges a full rectangle", () => {
    const grid: Grid = {
      origin: { row: 1, col: 1 },
      rows: [
        ["X", "X", "X"],
        ["X", "X", "X"],
      ],
    };
    expect(compress(grid).encodings.invertedIndex.string).toBe("A1:C2,X");
  });

  it("respects origin offsets in rendered ranges", () => {
    const grid: Grid = {
      origin: { row: 5, col: 3 },
      rows: [
        ["X", "X"],
        ["X", "X"],
      ],
    };
    expect(compress(grid).encodings.invertedIndex.string).toBe("C5:D6,X");
  });

  it("orders groups by first cell address (row-major)", () => {
    // "B" appears first at A1; "A" appears first at B1. So "B" comes first.
    const grid: Grid = {
      origin: { row: 1, col: 1 },
      rows: [["B", "A", "A"]],
    };
    const { encodings } = compress(grid);
    expect(encodings.invertedIndex.string).toBe("A1,B\nB1:C1,A");
  });

  it("escapes commas, pipes, backslashes and control chars in values", () => {
    const grid: Grid = {
      origin: { row: 1, col: 1 },
      rows: [["a,b", "c|d", "e\\f"]],
    };
    const { encodings } = compress(grid);
    expect(encodings.invertedIndex.string).toBe(
      "A1,a\\,b\nB1,c\\|d\nC1,e\\\\f",
    );
    // JSON form keeps raw values
    expect(
      (encodings.invertedIndex.json as { groups: Array<{ value: string }> })
        .groups.map((g) => g.value),
    ).toEqual(["a,b", "c|d", "e\\f"]);
  });

  it("keeps whitespace-only cells (only literal '' is empty)", () => {
    const grid: Grid = {
      origin: { row: 1, col: 1 },
      rows: [[" ", "", " "]],
    };
    // Both " " cells share a value; not contiguous, so two ranges.
    expect(compress(grid).encodings.invertedIndex.string).toBe("A1|C1, ");
  });

  it("handles a wholly-empty grid", () => {
    const r = compress({ origin: { row: 1, col: 1 }, rows: [] });
    expect(r.encodings.invertedIndex.string).toBe("");
    expect(r.encodings.invertedIndex.json).toEqual({
      encoding: "inverted-index",
      version: 0,
      origin: { row: 1, col: 1 },
      groups: [],
    });
    expect(r.encodings.invertedIndex.tokenEstimate).toBe(0);
  });

  it("splits an L-shape into two width-first rectangles", () => {
    // Width-first greedy: row 1 grabs A1:C1 horizontally, then A2 stands alone.
    const grid: Grid = {
      origin: { row: 1, col: 1 },
      rows: [
        ["X", "X", "X"],
        ["X", "", ""],
      ],
    };
    expect(compress(grid).encodings.invertedIndex.string).toBe("A1:C1|A2,X");
  });

  it("does not absorb a cell already claimed by a rectangle one row up", () => {
    // Row 1 grabs A1:C1; row 2 is "X X . X" → A2:B2 then D2.
    const grid: Grid = {
      origin: { row: 1, col: 1 },
      rows: [
        ["X", "X", "X", ""],
        ["X", "X", "", "X"],
      ],
    };
    expect(compress(grid).encodings.invertedIndex.string).toBe(
      "A1:C1|A2:B2|D2,X",
    );
  });

  it("computes token estimate via the v0 heuristic on the string form", () => {
    const grid: Grid = {
      origin: { row: 1, col: 1 },
      rows: [
        ["X", "X"],
        ["X", "X"],
      ],
    };
    const { encodings } = compress(grid);
    expect(encodings.invertedIndex.tokenEstimate).toBe(
      Math.ceil(encodings.invertedIndex.string.length / 4),
    );
  });

  it("groups identical values across non-contiguous cells into one group", () => {
    const grid: Grid = {
      origin: { row: 1, col: 1 },
      rows: [
        ["X", "", "X"],
        ["", "", ""],
        ["X", "", "X"],
      ],
    };
    expect(compress(grid).encodings.invertedIndex.string).toBe(
      "A1|C1|A3|C3,X",
    );
  });
});
