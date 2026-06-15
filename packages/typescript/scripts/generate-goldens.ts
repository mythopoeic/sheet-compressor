import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { compress } from "../src/compress.ts";
import { goldenFiles, loadFixtures } from "../src/fixtures.ts";

function main(): void {
  const fixtures = loadFixtures();
  if (fixtures.length === 0) {
    console.error("No fixtures found. Add one under fixtures/corpus/<id>/.");
    process.exit(1);
  }
  for (const fx of fixtures) {
    const result = compress(fx.input);
    const goldenDir = join(fx.dir, "golden");
    mkdirSync(goldenDir, { recursive: true });

    // anchor.string.txt — NO trailing newline so the file equals the encoding.
    writeFileSync(
      join(goldenDir, goldenFiles.anchorString),
      result.encodings.anchor.string,
    );

    // anchor.json — 2-space indent + ONE trailing newline (SPEC §3.3).
    writeFileSync(
      join(goldenDir, goldenFiles.anchorJson),
      `${JSON.stringify(result.encodings.anchor.json, null, 2)}\n`,
    );

    // invertedIndex.string.txt — NO trailing newline (SPEC §4.4).
    writeFileSync(
      join(goldenDir, goldenFiles.invertedIndexString),
      result.encodings.invertedIndex.string,
    );

    // invertedIndex.json — 2-space indent + ONE trailing newline (SPEC §4.5).
    writeFileSync(
      join(goldenDir, goldenFiles.invertedIndexJson),
      `${JSON.stringify(result.encodings.invertedIndex.json, null, 2)}\n`,
    );

    // formatAggregation.string.txt — NO trailing newline.
    writeFileSync(
      join(goldenDir, goldenFiles.formatAggregationString),
      result.encodings.formatAggregation.string,
    );

    // formatAggregation.json — 2-space indent + ONE trailing newline.
    writeFileSync(
      join(goldenDir, goldenFiles.formatAggregationJson),
      `${JSON.stringify(result.encodings.formatAggregation.json, null, 2)}\n`,
    );

    // charts.json — 2-space indent + ONE trailing newline (SPEC §6.2).
    writeFileSync(
      join(goldenDir, goldenFiles.charts),
      `${JSON.stringify(result.charts, null, 2)}\n`,
    );

    // token-estimate files — one integer + "\n".
    writeFileSync(
      join(goldenDir, goldenFiles.anchorTokens),
      `${result.encodings.anchor.tokenEstimate}\n`,
    );
    writeFileSync(
      join(goldenDir, goldenFiles.invertedIndexTokens),
      `${result.encodings.invertedIndex.tokenEstimate}\n`,
    );
    writeFileSync(
      join(goldenDir, goldenFiles.formatAggregationTokens),
      `${result.encodings.formatAggregation.tokenEstimate}\n`,
    );
    writeFileSync(
      join(goldenDir, goldenFiles.rawBaselineTokens),
      `${result.rawBaseline.tokenEstimate}\n`,
    );

    console.log(`wrote goldens for ${fx.id}`);
  }
}

main();
