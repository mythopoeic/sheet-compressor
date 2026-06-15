import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import { readSheet } from "../../src/adapters/xlsx.ts";
import type { Grid } from "../../src/index.ts";

import { buildChartXlsx } from "./xlsxBuilder.ts";

/** Build an .xlsx in-memory from a 2D array of cells using SheetJS. */
function buildBuffer(
  data: (string | number | boolean | Date | null)[][],
  opts: { sheetName?: string; origin?: string } = {},
): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(data, { cellDates: true });
  if (opts.origin) {
    // aoa_to_sheet always anchors at A1; rewrite ref + shift cells if needed.
    const range = XLSX.utils.decode_range(ws["!ref"] as string);
    const origin = XLSX.utils.decode_cell(opts.origin);
    const dr = origin.r - range.s.r;
    const dc = origin.c - range.s.c;
    if (dr !== 0 || dc !== 0) {
      const moved: Record<string, unknown> = {};
      for (const k of Object.keys(ws)) {
        if (k.startsWith("!")) continue;
        const c = XLSX.utils.decode_cell(k);
        const nc = { r: c.r + dr, c: c.c + dc };
        moved[XLSX.utils.encode_cell(nc)] = ws[k];
      }
      for (const k of Object.keys(ws)) if (!k.startsWith("!")) delete ws[k];
      Object.assign(ws, moved);
      ws["!ref"] = XLSX.utils.encode_range({
        s: { r: range.s.r + dr, c: range.s.c + dc },
        e: { r: range.e.r + dr, c: range.e.c + dc },
      });
    }
  }
  XLSX.utils.book_append_sheet(wb, ws, opts.sheetName ?? "Sheet1");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("readSheet — empty / minimal workbooks", () => {
  it("returns an empty grid for a workbook with no cells", () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, {}, "Sheet1");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const g: Grid = readSheet(buf);
    expect(g.rows).toEqual([]);
    expect(g.origin).toEqual({ row: 1, col: 1 });
    expect(g.charts ?? []).toEqual([]);
  });

  it("returns rows + origin {1,1} for an A1-anchored 2x2 grid", () => {
    const buf = buildBuffer([
      ["Name", "Qty"],
      ["Apple", 3],
    ]);
    const g = readSheet(buf);
    expect(g.rows).toEqual([
      ["Name", "Qty"],
      ["Apple", "3"],
    ]);
    expect(g.origin).toEqual({ row: 1, col: 1 });
  });

  it("respects the sheet's true origin when data starts away from A1", () => {
    const buf = buildBuffer(
      [
        ["Name", "Qty"],
        ["Apple", 3],
      ],
      { origin: "C5" },
    );
    const g = readSheet(buf);
    expect(g.origin).toEqual({ row: 5, col: 3 });
    expect(g.rows).toEqual([
      ["Name", "Qty"],
      ["Apple", "3"],
    ]);
  });

  it("fills cell-internal gaps with empty strings (no ragged rows)", () => {
    // Row 1 has B1 only, row 2 has A2 and C2 — range spans A1:C2.
    const wb = XLSX.utils.book_new();
    const ws: Record<string, unknown> = {
      "!ref": "A1:C2",
      B1: { t: "s", v: "B1val" },
      A2: { t: "s", v: "A2val" },
      C2: { t: "n", v: 7 },
    };
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const g = readSheet(buf);
    expect(g.rows).toEqual([
      ["", "B1val", ""],
      ["A2val", "", "7"],
    ]);
  });
});

describe("readSheet — sheet selection", () => {
  it("defaults to the first sheet", () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([["A"]]),
      "First",
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([["B"]]),
      "Second",
    );
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    expect(readSheet(buf).rows).toEqual([["A"]]);
  });

  it("selects a sheet by name", () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([["A"]]),
      "First",
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([["B"]]),
      "Second",
    );
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    expect(readSheet(buf, { sheet: "Second" }).rows).toEqual([["B"]]);
  });

  it("selects a sheet by 0-indexed position", () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([["A"]]),
      "First",
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([["B"]]),
      "Second",
    );
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    expect(readSheet(buf, { sheet: 1 }).rows).toEqual([["B"]]);
  });
});

describe("readSheet — cellMeta dataType", () => {
  it("maps SheetJS cell types to the core's DataType vocabulary", () => {
    const wb = XLSX.utils.book_new();
    const ws: Record<string, unknown> = {
      "!ref": "A1:F1",
      A1: { t: "s", v: "hello" },
      B1: { t: "n", v: 42 },
      C1: { t: "b", v: true },
      D1: { t: "d", v: new Date("2024-01-15T00:00:00Z") },
      E1: { t: "n", v: 7, f: "1+6" },
      F1: { t: "e", v: 7 },
    };
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const g = readSheet(buf);
    expect(g.cellMeta).toBeDefined();
    const types = g.cellMeta![0]!.map((m) => m.dataType);
    expect(types).toEqual([
      "text",
      "number",
      "bool",
      "date",
      "formula",
      "error",
    ]);
  });

  it("marks gap cells inside the used range as empty in cellMeta", () => {
    const wb = XLSX.utils.book_new();
    const ws: Record<string, unknown> = {
      "!ref": "A1:C1",
      A1: { t: "s", v: "x" },
      C1: { t: "n", v: 3 },
    };
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const g = readSheet(buf);
    expect(g.cellMeta).toBeDefined();
    expect(g.cellMeta![0]!.map((m) => m.dataType)).toEqual([
      "text",
      "empty",
      "number",
    ]);
  });

  it("omits cellMeta entirely when the workbook has no cell type info", () => {
    // Empty workbook — no cells at all → no metadata to emit.
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, {}, "Sheet1");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const g = readSheet(buf);
    expect(g.cellMeta).toBeUndefined();
  });
});

describe("readSheet — chart extraction", () => {
  it("extracts a single embedded bar chart with title, axes, series, data", () => {
    const buf = buildChartXlsx({
      data: [
        ["Quarter", "Sales"],
        ["Q1", 100],
        ["Q2", 150],
        ["Q3", 200],
      ],
      chart: {
        chartType: "bar",
        // anchor from B5 to F20 (xdr uses 0-indexed)
        anchor: { fromCol: 1, fromRow: 4, toCol: 5, toRow: 19 },
        name: "Q1Sales",
        title: "Sales",
        xAxisTitle: "Quarter",
        yAxisTitle: "Amount",
        series: [
          {
            nameLiteral: "Sales",
            valuesRange: "Sheet1!$B$2:$B$4",
          },
        ],
      },
    });
    const g = readSheet(buf);
    expect(g.charts).toBeDefined();
    expect(g.charts).toHaveLength(1);
    const c = g.charts![0]!;
    expect(c.name).toBe("Q1Sales");
    expect(c.type).toBe("bar");
    expect(c.anchorRange).toBe("B5:F20");
    expect(c.title).toBe("Sales");
    expect(c.axes).toEqual({ x: "Quarter", y: "Amount" });
    expect(c.series).toEqual(["Sales"]);
    expect(c.dataRanges).toEqual(["B2:B4"]);
  });

  it("maps SheetJS chart-type elements to the ChartType vocabulary", () => {
    for (const t of ["bar", "line", "pie", "scatter", "area"] as const) {
      const buf = buildChartXlsx({
        data: [["x"]],
        chart: {
          chartType: t,
          anchor: { fromCol: 0, fromRow: 0, toCol: 1, toRow: 1 },
          name: t,
        },
      });
      expect(readSheet(buf).charts![0]!.type).toBe(t);
    }
  });

  it("returns charts: [] when the workbook has no charts", () => {
    const buf = buildBuffer([["x"]]);
    expect(readSheet(buf).charts ?? []).toEqual([]);
  });
});
