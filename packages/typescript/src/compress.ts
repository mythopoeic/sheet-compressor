import { vanillaEncode } from "./baseline.ts";
import { encodeAnchor } from "./encodings/anchor.ts";
import { estimateTokens } from "./tokens.ts";
import type { CompressOptions, CompressResult, Grid } from "./types.ts";

export function compress(
  grid: Grid,
  options: CompressOptions = {},
): CompressResult {
  const tokenCounter = options.tokenCounter ?? estimateTokens;
  return {
    encodings: {
      anchor: encodeAnchor(grid, tokenCounter),
    },
    rawBaseline: { tokenEstimate: tokenCounter(vanillaEncode(grid)) },
  };
}
