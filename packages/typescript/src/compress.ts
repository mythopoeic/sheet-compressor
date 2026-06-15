import { vanillaEncode } from "./baseline.ts";
import { encodeAnchor } from "./encodings/anchor.ts";
import {
  appendChartBlock,
  renderChartBlock,
} from "./encodings/chartDescriptors.ts";
import { encodeFormatAggregation } from "./encodings/formatAggregation.ts";
import { encodeInvertedIndex } from "./encodings/invertedIndex.ts";
import { resolveStrategy } from "./strategies.ts";
import { estimateTokens } from "./tokens.ts";
import type {
  CompressOptions,
  CompressResult,
  Encoding,
  Grid,
  TokenCounter,
} from "./types.ts";

/**
 * SPEC §6.2: extend an encoding's `.string` with the chart block (if any) and
 * re-measure `.tokenEstimate` over the extended form. The encoding's `.json`
 * is unchanged — chart data only lives in the string + the top-level echo.
 */
function withCharts<T>(
  encoding: Encoding<T>,
  chartBlock: string,
  tokenCounter: TokenCounter,
): Encoding<T> {
  if (chartBlock === "") return encoding;
  const string = appendChartBlock(encoding.string, chartBlock);
  return { string, json: encoding.json, tokenEstimate: tokenCounter(string) };
}

export function compress(
  grid: Grid,
  options: CompressOptions = {},
): CompressResult {
  const strategy = resolveStrategy(options.anchorStrategy);
  const detection = strategy.detect(grid);
  const tokenCounter = options.tokenCounter ?? estimateTokens;
  const chartBlock = renderChartBlock(grid.charts);
  return {
    encodings: {
      anchor: withCharts(
        encodeAnchor(grid, detection, tokenCounter),
        chartBlock,
        tokenCounter,
      ),
      invertedIndex: withCharts(
        encodeInvertedIndex(grid, tokenCounter),
        chartBlock,
        tokenCounter,
      ),
      formatAggregation: withCharts(
        encodeFormatAggregation(grid, tokenCounter),
        chartBlock,
        tokenCounter,
      ),
    },
    charts: grid.charts ? [...grid.charts] : [],
    rawBaseline: { tokenEstimate: tokenCounter(vanillaEncode(grid)) },
  };
}
