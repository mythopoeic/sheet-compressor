import { describe, expect, it } from "vitest";
import { compress } from "../src/index.ts";
import type { Grid } from "../src/index.ts";

const baseGrid: Grid = {
  origin: { row: 1, col: 1 },
  rows: [
    ["Name", "Qty", "Price"],
    ["Apple", "3", "1.50"],
    ["", "", ""],
    ["Pear", "5", "0.30"],
  ],
};

describe("compress() — anchor skeleton, v0", () => {
  it("emits the spec example string verbatim", () => {
    const { encodings } = compress(baseGrid);
    expect(encodings.anchor.string).toBe(
      [
        "A1,Name|B1,Qty|C1,Price",
        "A2,Apple|B2,3|C2,1.50",
        "A4,Pear|B4,5|C4,0.30",
      ].join("\n"),
    );
  });

  it("emits the spec example JSON shape (row-major, raw values, no empties)", () => {
    const { encodings } = compress(baseGrid);
    expect(encodings.anchor.json).toEqual({
      encoding: "anchor-skeleton",
      version: 0,
      origin: { row: 1, col: 1 },
      cells: [
        { address: "A1", value: "Name" },
        { address: "B1", value: "Qty" },
        { address: "C1", value: "Price" },
        { address: "A2", value: "Apple" },
        { address: "B2", value: "3" },
        { address: "C2", value: "1.50" },
        { address: "A4", value: "Pear" },
        { address: "B4", value: "5" },
        { address: "C4", value: "0.30" },
      ],
    });
  });

  it("respects the origin offset in A1 addresses", () => {
    const { encodings } = compress({ ...baseGrid, origin: { row: 5, col: 3 } });
    expect(encodings.anchor.string).toBe(
      [
        "C5,Name|D5,Qty|E5,Price",
        "C6,Apple|D6,3|E6,1.50",
        "C8,Pear|D8,5|E8,0.30",
      ].join("\n"),
    );
    expect((encodings.anchor.json as { origin: unknown }).origin).toEqual({
      row: 5,
      col: 3,
    });
  });

  it("keeps whitespace-only cells (only literal '' is empty)", () => {
    const { encodings } = compress({
      origin: { row: 1, col: 1 },
      rows: [[" ", "", "\t"]],
    });
    expect(encodings.anchor.string).toBe("A1, |C1,\\t");
  });

  it("escapes delimiters and control characters in values", () => {
    const { encodings } = compress({
      origin: { row: 1, col: 1 },
      rows: [["a,b", "c|d", "e\\f", "g\nh\rj\tk"]],
    });
    expect(encodings.anchor.string).toBe(
      "A1,a\\,b|B1,c\\|d|C1,e\\\\f|D1,g\\nh\\rj\\tk",
    );
    // JSON form holds raw, unescaped values.
    expect(
      (
        encodings.anchor.json as {
          cells: Array<{ value: string }>;
        }
      ).cells.map((c) => c.value),
    ).toEqual(["a,b", "c|d", "e\\f", "g\nh\rj\tk"]);
  });

  it("drops fully-empty rows but keeps partially-populated rows", () => {
    const { encodings } = compress({
      origin: { row: 1, col: 1 },
      rows: [
        ["", "X"],
        ["", ""],
        ["Y", ""],
      ],
    });
    expect(encodings.anchor.string).toBe("B1,X\nA3,Y");
  });

  it("handles a wholly-empty grid", () => {
    const r = compress({ origin: { row: 1, col: 1 }, rows: [] });
    expect(r.encodings.anchor.string).toBe("");
    expect(r.encodings.anchor.json).toEqual({
      encoding: "anchor-skeleton",
      version: 0,
      origin: { row: 1, col: 1 },
      cells: [],
    });
    expect(r.encodings.anchor.tokenEstimate).toBe(0);
    expect(r.rawBaseline.tokenEstimate).toBe(0);
  });

  it("computes token estimates via the v0 heuristic (ceil len/4)", () => {
    // baseGrid string is 67 chars across 3 lines:
    //   "A1,Name|B1,Qty|C1,Price"        (23)
    //   "A2,Apple|B2,3|C2,1.50"          (21)
    //   "A4,Pear|B4,5|C4,0.30"           (20)
    //   + 2 newlines                     => 66
    const { encodings, rawBaseline } = compress(baseGrid);
    expect(encodings.anchor.tokenEstimate).toBe(
      Math.ceil(encodings.anchor.string.length / 4),
    );
    // rawBaseline measures the vanilla " | "-joined encoding.
    const vanilla =
      "Name | Qty | Price\nApple | 3 | 1.50\n |  | \nPear | 5 | 0.30";
    expect(rawBaseline.tokenEstimate).toBe(Math.ceil(vanilla.length / 4));
  });

  it("handles ragged rows by treating missing cells as empty", () => {
    const { encodings } = compress({
      origin: { row: 1, col: 1 },
      rows: [["A", "B", "C"], ["D"], ["E", "F"]],
    });
    expect(encodings.anchor.string).toBe(
      "A1,A|B1,B|C1,C\nA2,D\nA3,E|B3,F",
    );
  });

  it("defaults to phase1 end-to-end (prunes a grid keep-all would retain)", () => {
    // 3x3 of identical text values: no row/col exceeds the 0.5 heterogeneity
    // threshold (1 unique / 3 nonEmpty = 0.33) and there are no inter-row or
    // inter-col type transitions, so phase1 finds zero anchors and the kept
    // region is empty. keep-all retains every cell. The two strategies must
    // therefore diverge through compress() — pinning the default wiring.
    const uniformGrid: Grid = {
      origin: { row: 1, col: 1 },
      rows: [
        ["x", "x", "x"],
        ["x", "x", "x"],
        ["x", "x", "x"],
      ],
    };
    const defaultOut = compress(uniformGrid).encodings.anchor.string;
    const keepAllOut = compress(uniformGrid, {
      anchorStrategy: "keep-all",
    }).encodings.anchor.string;
    expect(defaultOut).toBe("");
    expect(keepAllOut).toBe(
      [
        "A1,x|B1,x|C1,x",
        "A2,x|B2,x|C2,x",
        "A3,x|B3,x|C3,x",
      ].join("\n"),
    );
    expect(defaultOut).not.toBe(keepAllOut);
  });
});
