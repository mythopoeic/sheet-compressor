import { vanillaEncode } from "./baseline.ts";
import { encodeAnchor } from "./encodings/anchor.ts";
import { encodeInvertedIndex } from "./encodings/invertedIndex.ts";
import { estimateTokens } from "./tokens.ts";
import type { CompressOptions, CompressResult, Grid } from "./types.ts";

export function compress(
  grid: Grid,
  _options: CompressOptions = {},
): CompressResult {
  return {
    encodings: {
      anchor: encodeAnchor(grid),
      invertedIndex: encodeInvertedIndex(grid),
    },
    rawBaseline: { tokenEstimate: estimateTokens(vanillaEncode(grid)) },
  };
}
