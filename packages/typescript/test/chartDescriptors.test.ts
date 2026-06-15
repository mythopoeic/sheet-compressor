import { describe, expect, it } from "vitest";

import { compress } from "../src/compress.ts";
import {
  appendChartBlock,
  renderChartBlock,
  renderChartToken,
} from "../src/encodings/chartDescriptors.ts";
import type { ChartDescriptor, Grid } from "../src/types.ts";

describe("renderChartToken — SPEC §6.1", () => {
  it("renders the PRD example", () => {
    const chart: ChartDescriptor = {
      name: "Q1Sales",
      type: "bar",
      anchorRange: "B5:F20",
      title: "Sales",
      dataRanges: ["A1:D10"],
      series: ["Q1", "Q2"],
    };
    expect(renderChartToken(chart)).toBe(
      'CHART(bar)@B5:F20 title="Sales" data=A1:D10 series=[Q1,Q2]',
    );
  });

  it("omits every optional field when only type and anchorRange are set", () => {
    expect(
      renderChartToken({ name: "x", type: "pie", anchorRange: "A1:B2" }),
    ).toBe("CHART(pie)@A1:B2");
  });

  it("omits empty dataRanges and series arrays (not rendered as empty)", () => {
    expect(
      renderChartToken({
        name: "x",
        type: "line",
        anchorRange: "C3",
        dataRanges: [],
        series: [],
      }),
    ).toBe("CHART(line)@C3");
  });

  it("does NOT render the name field", () => {
    expect(
      renderChartToken({
        name: "SecretInternalId",
        type: "bar",
        anchorRange: "A1",
      }),
    ).toBe("CHART(bar)@A1");
  });

  it("renders fields in fixed order: title, data, series, xAxis, yAxis", () => {
    expect(
      renderChartToken({
        name: "x",
        type: "scatter",
        anchorRange: "A1:Z99",
        // Listed here out of canonical order on purpose:
        axes: { y: "Revenue", x: "Quarter" },
        series: ["Q1"],
        title: "All",
        dataRanges: ["A1:B2"],
      }),
    ).toBe(
      'CHART(scatter)@A1:Z99 title="All" data=A1:B2 series=[Q1] xAxis="Quarter" yAxis="Revenue"',
    );
  });

  it("renders xAxis without yAxis when only axes.x is set", () => {
    expect(
      renderChartToken({
        name: "x",
        type: "bar",
        anchorRange: "A1",
        axes: { x: "Quarter" },
      }),
    ).toBe('CHART(bar)@A1 xAxis="Quarter"');
  });

  it("renders yAxis without xAxis when only axes.y is set", () => {
    expect(
      renderChartToken({
        name: "x",
        type: "bar",
        anchorRange: "A1",
        axes: { y: "Revenue" },
      }),
    ).toBe('CHART(bar)@A1 yAxis="Revenue"');
  });

  it('escapes backslash, quote, and \\n \\r \\t in title', () => {
    expect(
      renderChartToken({
        name: "x",
        type: "bar",
        anchorRange: "A1",
        title: 'a "b" c\\d\ne\rf\tg',
      }),
    ).toBe('CHART(bar)@A1 title="a \\"b\\" c\\\\d\\ne\\rf\\tg"');
  });

  it("escapes axes.x and axes.y the same way as title", () => {
    expect(
      renderChartToken({
        name: "x",
        type: "bar",
        anchorRange: "A1",
        axes: { x: 'has "quote"', y: "newline\nhere" },
      }),
    ).toBe('CHART(bar)@A1 xAxis="has \\"quote\\"" yAxis="newline\\nhere"');
  });

  it("escapes backslash, comma, and ] in series names", () => {
    expect(
      renderChartToken({
        name: "x",
        type: "bar",
        anchorRange: "A1",
        series: ["a,b", "c]d", "e\\f", "\nrow"],
      }),
    ).toBe("CHART(bar)@A1 series=[a\\,b,c\\]d,e\\\\f,\\nrow]");
  });

  it("joins multiple data ranges with bare commas (ranges never need escaping)", () => {
    expect(
      renderChartToken({
        name: "x",
        type: "bar",
        anchorRange: "A1:Z99",
        dataRanges: ["A1:B2", "C5:D10", "E1"],
      }),
    ).toBe("CHART(bar)@A1:Z99 data=A1:B2,C5:D10,E1");
  });
});

describe("renderChartBlock — SPEC §6.2", () => {
  it("returns empty string for undefined / empty input", () => {
    expect(renderChartBlock(undefined)).toBe("");
    expect(renderChartBlock([])).toBe("");
  });

  it("joins multiple charts with \\n in input order, no trailing newline", () => {
    const block = renderChartBlock([
      { name: "a", type: "bar", anchorRange: "A1" },
      { name: "b", type: "pie", anchorRange: "B2" },
    ]);
    expect(block).toBe("CHART(bar)@A1\nCHART(pie)@B2");
  });
});

describe("appendChartBlock — SPEC §6.2", () => {
  it("returns cells when chart block is empty", () => {
    expect(appendChartBlock("A1,x", "")).toBe("A1,x");
  });

  it("returns chart block alone when cells are empty", () => {
    expect(appendChartBlock("", "CHART(bar)@A1")).toBe("CHART(bar)@A1");
  });

  it("joins cells and chart block with a single \\n", () => {
    expect(appendChartBlock("A1,x", "CHART(bar)@A1")).toBe(
      "A1,x\nCHART(bar)@A1",
    );
  });

  it("returns empty when both are empty", () => {
    expect(appendChartBlock("", "")).toBe("");
  });
});

describe("compress() integration — charts in each encoding", () => {
  const charts: ChartDescriptor[] = [
    {
      name: "Q1Sales",
      type: "bar",
      anchorRange: "B5:F20",
      title: "Sales",
      dataRanges: ["A1:D10"],
      series: ["Q1", "Q2"],
    },
  ];

  const grid: Grid = {
    rows: [["Name", "Qty"], ["Apple", "3"]],
    origin: { row: 1, col: 1 },
    charts,
  };

  it("appends the chart block to anchor.string", () => {
    const result = compress(grid);
    expect(result.encodings.anchor.string.endsWith(
      'CHART(bar)@B5:F20 title="Sales" data=A1:D10 series=[Q1,Q2]',
    )).toBe(true);
    // exactly one `\n` between the last cell line and the chart line
    expect(result.encodings.anchor.string).toContain(
      'A2,Apple|B2,3\nCHART(bar)',
    );
  });

  it("appends the chart block to invertedIndex.string", () => {
    const result = compress(grid);
    expect(result.encodings.invertedIndex.string.endsWith(
      'CHART(bar)@B5:F20 title="Sales" data=A1:D10 series=[Q1,Q2]',
    )).toBe(true);
  });

  it("appends the chart block to formatAggregation.string", () => {
    const result = compress(grid);
    expect(result.encodings.formatAggregation.string.endsWith(
      'CHART(bar)@B5:F20 title="Sales" data=A1:D10 series=[Q1,Q2]',
    )).toBe(true);
  });

  it("echoes the descriptors verbatim on result.charts", () => {
    const result = compress(grid);
    expect(result.charts).toEqual(charts);
  });

  it("leaves encoding JSON schemas unchanged (no chart field)", () => {
    const result = compress(grid);
    expect(Object.keys(result.encodings.anchor.json).sort()).toEqual([
      "cells",
      "encoding",
      "origin",
      "version",
    ]);
    expect(Object.keys(result.encodings.invertedIndex.json).sort()).toEqual([
      "encoding",
      "groups",
      "origin",
      "version",
    ]);
    expect(Object.keys(result.encodings.formatAggregation.json).sort()).toEqual([
      "encoding",
      "groups",
      "origin",
      "version",
    ]);
  });

  it("tokenEstimate covers the extended string including charts", () => {
    const withCharts = compress(grid);
    const { charts: _omit, ...gridNoCharts } = grid;
    void _omit;
    const withoutCharts = compress(gridNoCharts);
    expect(withCharts.encodings.anchor.tokenEstimate).toBeGreaterThan(
      withoutCharts.encodings.anchor.tokenEstimate,
    );
  });

  it("on an empty grid with charts: encoding string is just the chart block", () => {
    const result = compress({
      rows: [],
      origin: { row: 1, col: 1 },
      charts: [{ name: "x", type: "bar", anchorRange: "A1" }],
    });
    expect(result.encodings.anchor.string).toBe("CHART(bar)@A1");
    expect(result.encodings.invertedIndex.string).toBe("CHART(bar)@A1");
    expect(result.encodings.formatAggregation.string).toBe("CHART(bar)@A1");
  });

  it("with no charts: result.charts is the empty array", () => {
    expect(compress({ rows: [["x"]], origin: { row: 1, col: 1 } }).charts).toEqual([]);
  });

  it("does NOT include chart text in rawBaseline.tokenEstimate", () => {
    const withCharts = compress(grid);
    const { charts: _omit, ...gridNoCharts } = grid;
    void _omit;
    const withoutCharts = compress(gridNoCharts);
    expect(withCharts.rawBaseline.tokenEstimate).toBe(
      withoutCharts.rawBaseline.tokenEstimate,
    );
  });
});
