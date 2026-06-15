import { describe, expect, it } from "vitest";
import { classify, encodeFormatAggregation } from "../src/encodings/formatAggregation.ts";
import { compress, estimateTokens } from "../src/index.ts";
import { loadFixtures } from "../src/fixtures.ts";
import type { FormatType, Grid } from "../src/index.ts";

describe("classify()", () => {
  it("classifies numeric primitives", () => {
    expect(classify("0")).toBe("IntNum");
    expect(classify("42")).toBe("IntNum");
    expect(classify("-7")).toBe("IntNum");
    expect(classify("3.14")).toBe("FloatNum");
    expect(classify("-0.5")).toBe("FloatNum");
    expect(classify(".5")).toBe("FloatNum");
    expect(classify("1.")).toBe("FloatNum");
    expect(classify("1.5e10")).toBe("ScientificNum");
    expect(classify("-2.0E-3")).toBe("ScientificNum");
  });

  it("classifies percentages and currency", () => {
    expect(classify("50%")).toBe("PercentageNum");
    expect(classify("-12.5%")).toBe("PercentageNum");
    expect(classify("$100")).toBe("CurrencyData");
    expect(classify("$1.50")).toBe("CurrencyData");
    expect(classify("-$5")).toBe("CurrencyData");
    expect(classify("€42")).toBe("CurrencyData");
    expect(classify("£10.00")).toBe("CurrencyData");
    expect(classify("¥99")).toBe("CurrencyData");
  });

  it("classifies dates, times and years", () => {
    expect(classify("2024-01-15")).toBe("DateData");
    expect(classify("01/15/2024")).toBe("DateData");
    expect(classify("1-15-24")).toBe("DateData");
    expect(classify("12:30")).toBe("TimeData");
    expect(classify("12:30:45")).toBe("TimeData");
    expect(classify("12:30 PM")).toBe("TimeData");
    expect(classify("1:05am")).toBe("TimeData");
    expect(classify("1999")).toBe("YearData");
    expect(classify("2026")).toBe("YearData");
  });

  it("classifies booleans and emails", () => {
    expect(classify("TRUE")).toBe("Boolean");
    expect(classify("False")).toBe("Boolean");
    expect(classify("true")).toBe("Boolean");
    expect(classify("a@b.co")).toBe("EmailData");
    expect(classify("john.doe@example.com")).toBe("EmailData");
  });

  it("falls back to Text for anything else", () => {
    expect(classify("Apple")).toBe("Text");
    expect(classify(" ")).toBe("Text");
    expect(classify("1,234.56")).toBe("Text"); // grouped numbers are not Int/Float
    expect(classify("not a date")).toBe("Text");
  });

  it("returns null for the empty string", () => {
    expect(classify("")).toBeNull();
  });

  it("year is matched in preference to integer", () => {
    // 1900..2099 are YearData; outside that range stays IntNum.
    expect(classify("1900")).toBe("YearData");
    expect(classify("2099")).toBe("YearData");
    expect(classify("1899")).toBe("IntNum");
    expect(classify("2100")).toBe("IntNum");
  });
});

describe("encodeFormatAggregation()", () => {
  it("emits an empty string and empty groups for a wholly-empty grid", () => {
    const out = encodeFormatAggregation({
      origin: { row: 1, col: 1 },
      rows: [],
    }, estimateTokens);
    expect(out.string).toBe("");
    expect(out.json).toEqual({
      encoding: "format-aggregation",
      version: 0,
      origin: { row: 1, col: 1 },
      groups: [],
    });
    expect(out.tokenEstimate).toBe(0);
  });

  it("renders single-cell rectangles as a bare A1 address", () => {
    const out = encodeFormatAggregation({
      origin: { row: 1, col: 1 },
      rows: [["1"]],
    }, estimateTokens);
    expect(out.string).toBe("IntNum: A1");
  });

  it("merges a horizontal run of same-type cells into one range", () => {
    const out = encodeFormatAggregation({
      origin: { row: 1, col: 1 },
      rows: [["1", "2", "3"]],
    }, estimateTokens);
    expect(out.string).toBe("IntNum: A1:C1");
  });

  it("merges a vertical run of same-type cells into one range", () => {
    const out = encodeFormatAggregation({
      origin: { row: 1, col: 1 },
      rows: [["1"], ["2"], ["3"]],
    }, estimateTokens);
    expect(out.string).toBe("IntNum: A1:A3");
  });

  it("merges a 2-D rectangle when every cell has the same type", () => {
    const out = encodeFormatAggregation({
      origin: { row: 1, col: 1 },
      rows: [
        ["1", "2"],
        ["3", "4"],
      ],
    }, estimateTokens);
    expect(out.string).toBe("IntNum: A1:B2");
  });

  it("breaks rectangles at empty cells (no aggregation across gaps)", () => {
    const out = encodeFormatAggregation({
      origin: { row: 1, col: 1 },
      rows: [["1", "", "3"]],
    }, estimateTokens);
    expect(out.string).toBe("IntNum: A1,C1");
  });

  it("emits groups in the canonical type order, ranges in row-major discovery order", () => {
    // Layout:
    //   row 1: Text Text Text
    //   row 2: Date Text Int Float Float
    //   row 3: Date Text Int Float Float
    const out = encodeFormatAggregation({
      origin: { row: 1, col: 1 },
      rows: [
        ["Date", "Item", "Price"],
        ["2024-01-15", "Apple", "10", "1.50", "2.00"],
        ["2024-01-16", "Pear", "20", "3.50", "4.00"],
      ],
    }, estimateTokens);
    expect(out.string).toBe(
      [
        "IntNum: C2:C3",
        "FloatNum: D2:E3",
        "DateData: A2:A3",
        "Text: A1:C1,B2:B3",
      ].join("\n"),
    );
  });

  it("respects the origin offset", () => {
    const out = encodeFormatAggregation({
      origin: { row: 5, col: 3 },
      rows: [["1", "2"]],
    }, estimateTokens);
    expect(out.string).toBe("IntNum: C5:D5");
  });

  it("token estimate uses the v0 heuristic over the string form", () => {
    const out = encodeFormatAggregation({
      origin: { row: 1, col: 1 },
      rows: [["1", "2"]],
    }, estimateTokens);
    expect(out.tokenEstimate).toBe(Math.ceil(out.string.length / 4));
  });
});

describe("compress() — format-aggregation slot", () => {
  it("populates encodings.formatAggregation on every result", () => {
    const grid: Grid = {
      origin: { row: 1, col: 1 },
      rows: [
        ["Name", "Qty", "Price"],
        ["Apple", "3", "1.50"],
        ["", "", ""],
        ["Pear", "5", "0.30"],
      ],
    };
    const { encodings } = compress(grid);
    expect(encodings.formatAggregation.string).toBe(
      [
        "IntNum: B2,B4",
        "FloatNum: C2,C4",
        "Text: A1:C1,A2,A4",
      ].join("\n"),
    );
    expect(encodings.formatAggregation.json).toEqual({
      encoding: "format-aggregation",
      version: 0,
      origin: { row: 1, col: 1 },
      groups: [
        { type: "IntNum", ranges: ["B2", "B4"] },
        { type: "FloatNum", ranges: ["C2", "C4"] },
        { type: "Text", ranges: ["A1:C1", "A2", "A4"] },
      ],
    });
  });
});

describe("context-aware year disambiguation (SPEC §5.1.1)", () => {
  const fa = (rows: string[][]) =>
    encodeFormatAggregation({ origin: { row: 1, col: 1 }, rows }, estimateTokens)
      .string;

  it("keeps year candidates as YearData under a year-like header", () => {
    expect(fa([["Year"], ["2018"], ["2019"], ["2020"]])).toBe(
      "YearData: A2:A4\nText: A1",
    );
    // FY / Fiscal Year also count.
    expect(fa([["FY"], ["2021"], ["2022"]])).toBe("YearData: A2:A3\nText: A1");
  });

  it("demotes in-range integers to IntNum under a non-year header", () => {
    expect(fa([["Units"], ["2020"], ["5000"], ["12"]])).toBe(
      "IntNum: A2:A4\nText: A1",
    );
  });

  it("finds the header even when data sits between it and the candidate", () => {
    expect(fa([["Units"], ["100"], ["2020"]])).toBe("IntNum: A2:A3\nText: A1");
  });

  it("treats a header-less column of all year-range integers as YearData", () => {
    expect(fa([["1990"], ["2000"], ["2010"]])).toBe("YearData: A1:A3");
  });

  it("falls back to IntNum when a header-less column mixes years and non-years", () => {
    expect(fa([["2000"], ["5"], ["2010"]])).toBe("IntNum: A1:A3");
  });

  it("treats an isolated in-range integer as IntNum, not a year", () => {
    expect(fa([["2020"]])).toBe("IntNum: A1");
  });

  it("does not treat a month-year date header (yy-mm) as a year header", () => {
    // "20-Aug" is Text; the lone in-range integer below has a non-year header.
    expect(fa([["yy-mm"], ["2020"]])).toBe("IntNum: A2\nText: A1");
  });
});

describe("corpus coverage (issue #22)", () => {
  it("the format-coverage fixture exercises every FormatType category", () => {
    // SPEC §5.1: a porter who mis-implements any one category must trip on the
    // corpus, not pass it. Pin the intent here so a future fixture edit that
    // silently drops (e.g.) CurrencyData is caught as a coverage regression
    // instead of being hidden by a re-generated golden.
    const all: readonly FormatType[] = [
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
    ];
    const fx = loadFixtures().find((f) => f.id === "format-coverage");
    expect(fx, "format-coverage fixture is missing").toBeDefined();
    const { encodings } = compress(fx!.input);
    const present = new Set(
      encodings.formatAggregation.json.groups.map((g) => g.type),
    );
    for (const t of all) {
      expect(present, `${t} missing from format-coverage`).toContain(t);
    }
  });
});
