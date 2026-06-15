import { vanillaEncode } from "./baseline.ts";
import { encodeAnchor } from "./encodings/anchor.ts";
import { encodeFormatAggregation } from "./encodings/formatAggregation.ts";
import { encodeInvertedIndex } from "./encodings/invertedIndex.ts";
import { resolveStrategy } from "./strategies.ts";
import { estimateTokens } from "./tokens.ts";
import type { CompressOptions, CompressResult, Grid } from "./types.ts";

export function compress(
  grid: Grid,
  options: CompressOptions = {},
): CompressResult {
  const strategy = resolveStrategy(options.anchorStrategy);
  const detection = strategy.detect(grid);
  const tokenCounter = options.tokenCounter ?? estimateTokens;
  return {
    encodings: {
      anchor: encodeAnchor(grid, detection, tokenCounter),
      invertedIndex: encodeInvertedIndex(grid, tokenCounter),
      formatAggregation: encodeFormatAggregation(grid, tokenCounter),
    },
    rawBaseline: { tokenEstimate: tokenCounter(vanillaEncode(grid)) },
  };
}
