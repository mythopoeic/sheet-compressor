import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { prompts } from "../src/prompts.ts";

describe("prompts — SPEC §9 (shared source mirrored into TS)", () => {
  describe("reader explainers", () => {
    it("exposes an anchor-skeleton reader prompt", () => {
      expect(prompts.readers.anchor).toMatch(/anchor[-\s]skeleton/i);
      expect(prompts.readers.anchor).toContain("A1");
      // mentions the row/column token separator
      expect(prompts.readers.anchor).toContain("|");
    });

    it("exposes an inverted-index reader prompt", () => {
      expect(prompts.readers.invertedIndex).toMatch(/inverted[-\s]index/i);
      // covers the "range1|range2,value" syntax and the single-cell short form
      expect(prompts.readers.invertedIndex).toMatch(/A1:[A-Z]/);
    });

    it("exposes a format-aggregation reader prompt", () => {
      expect(prompts.readers.formatAggregation).toMatch(
        /format[-\s]aggregation/i,
      );
      // enumerates at least a few of the 11 type categories
      expect(prompts.readers.formatAggregation).toContain("IntNum");
      expect(prompts.readers.formatAggregation).toContain("FloatNum");
      expect(prompts.readers.formatAggregation).toContain("Text");
    });
  });

  describe("task templates", () => {
    it("exposes a table/region-detection task prompt", () => {
      expect(prompts.tasks.tableRegionDetection).toMatch(/table|region/i);
    });

    it("exposes a cell-value-lookup task prompt", () => {
      expect(prompts.tasks.cellValueLookup).toMatch(/cell/i);
      expect(prompts.tasks.cellValueLookup).toMatch(/value|lookup/i);
    });

    it("exposes a sheet Q&A task prompt", () => {
      expect(prompts.tasks.sheetQA).toMatch(/question|answer|Q&A|sheet/i);
    });
  });

  describe("CHART(...) descriptor snippet", () => {
    it("exposes the chart-descriptor reader snippet", () => {
      expect(prompts.snippets.chartDescriptor).toContain("CHART(");
      // mentions the @anchorRange and at least one optional field name
      expect(prompts.snippets.chartDescriptor).toContain("@");
      expect(prompts.snippets.chartDescriptor).toMatch(/title|series|data/);
    });
  });

  describe("shape and integrity", () => {
    it("every prompt is a non-empty string", () => {
      const all: string[] = [
        prompts.readers.anchor,
        prompts.readers.invertedIndex,
        prompts.readers.formatAggregation,
        prompts.tasks.tableRegionDetection,
        prompts.tasks.cellValueLookup,
        prompts.tasks.sheetQA,
        prompts.snippets.chartDescriptor,
      ];
      for (const p of all) {
        expect(typeof p).toBe("string");
        expect(p.trim().length).toBeGreaterThan(0);
      }
    });

    it("mirrors the shared prompts/ source byte-for-byte", () => {
      // Mirroring contract: the TS constants MUST equal the canonical files in
      // the repo's top-level prompts/ source. The conformance is byte-level so
      // future language ports can use the same files.
      const promptsRoot = join(
        import.meta.dirname,
        "..",
        "..",
        "..",
        "prompts",
      );
      const expectMirrors = (file: string, value: string): void => {
        const onDisk = readFileSync(join(promptsRoot, file), "utf8");
        expect(value).toBe(onDisk);
      };
      expectMirrors("readers/anchor.md", prompts.readers.anchor);
      expectMirrors(
        "readers/invertedIndex.md",
        prompts.readers.invertedIndex,
      );
      expectMirrors(
        "readers/formatAggregation.md",
        prompts.readers.formatAggregation,
      );
      expectMirrors(
        "tasks/tableRegionDetection.md",
        prompts.tasks.tableRegionDetection,
      );
      expectMirrors(
        "tasks/cellValueLookup.md",
        prompts.tasks.cellValueLookup,
      );
      expectMirrors("tasks/sheetQA.md", prompts.tasks.sheetQA);
      expectMirrors(
        "snippets/chartDescriptor.md",
        prompts.snippets.chartDescriptor,
      );
    });
  });
});
