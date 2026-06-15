import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { compress } from "../src/compress.ts";
import { goldenFiles, loadFixtures } from "../src/fixtures.ts";

const fixtures = loadFixtures();

describe("conformance corpus", () => {
  it("contains at least one fixture", () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  describe.each(fixtures.map((fx) => [fx.id, fx] as const))(
    "fixture %s",
    (_id, fx) => {
      const result = compress(fx.input);
      const goldenDir = join(fx.dir, "golden");

      it("matches the anchor.string golden", () => {
        const expected = readFileSync(
          join(goldenDir, goldenFiles.anchorString),
          "utf8",
        );
        expect(result.encodings.anchor.string).toBe(expected);
      });

      it("matches the anchor.json golden", () => {
        const expected = readFileSync(
          join(goldenDir, goldenFiles.anchorJson),
          "utf8",
        );
        const produced = `${JSON.stringify(
          result.encodings.anchor.json,
          null,
          2,
        )}\n`;
        expect(produced).toBe(expected);
      });

      it("matches the anchor.tokenEstimate golden", () => {
        const expected = readFileSync(
          join(goldenDir, goldenFiles.anchorTokens),
          "utf8",
        ).trim();
        expect(String(result.encodings.anchor.tokenEstimate)).toBe(expected);
      });

      it("matches the invertedIndex.string golden", () => {
        const expected = readFileSync(
          join(goldenDir, goldenFiles.invertedIndexString),
          "utf8",
        );
        expect(result.encodings.invertedIndex.string).toBe(expected);
      });

      it("matches the invertedIndex.json golden", () => {
        const expected = readFileSync(
          join(goldenDir, goldenFiles.invertedIndexJson),
          "utf8",
        );
        const produced = `${JSON.stringify(
          result.encodings.invertedIndex.json,
          null,
          2,
        )}\n`;
        expect(produced).toBe(expected);
      });

      it("matches the invertedIndex.tokenEstimate golden", () => {
        const expected = readFileSync(
          join(goldenDir, goldenFiles.invertedIndexTokens),
          "utf8",
        ).trim();
        expect(String(result.encodings.invertedIndex.tokenEstimate)).toBe(
          expected,
        );
      });

      it("matches the rawBaseline.tokenEstimate golden", () => {
        const expected = readFileSync(
          join(goldenDir, goldenFiles.rawBaselineTokens),
          "utf8",
        ).trim();
        expect(String(result.rawBaseline.tokenEstimate)).toBe(expected);
      });
    },
  );
});
