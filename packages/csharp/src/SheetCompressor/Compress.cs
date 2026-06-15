using System.Collections.Generic;
using SheetCompressor.Encodings;

namespace SheetCompressor;

public static class Compressor
{
    public static CompressResult Compress(Grid grid, CompressOptions? options = null)
    {
        options ??= new CompressOptions();
        var strategy = Strategies.Resolve(options.AnchorStrategy);
        var detection = strategy.Detect(grid);
        var tokenCounter = options.TokenCounter ?? Tokens.EstimateTokens;
        var chartBlock = ChartDescriptors.RenderChartBlock(grid.Charts);

        var anchor = Encodings.Anchor.Encode(grid, detection, tokenCounter);
        var inverted = Encodings.InvertedIndex.Encode(grid, tokenCounter);
        var formatAgg = Encodings.FormatAggregation.Encode(grid, tokenCounter);

        return new CompressResult
        {
            Encodings = new EncodingsBundle
            {
                Anchor = WithCharts(anchor, chartBlock, tokenCounter),
                InvertedIndex = WithCharts(inverted, chartBlock, tokenCounter),
                FormatAggregation = WithCharts(formatAgg, chartBlock, tokenCounter),
            },
            Charts = grid.Charts is null
                ? new List<ChartDescriptor>()
                : new List<ChartDescriptor>(grid.Charts),
            RawBaseline = new TokenBaseline
            {
                TokenEstimate = tokenCounter(Baseline.VanillaEncode(grid)),
            },
        };
    }

    /// <summary>
    /// SPEC §6.2: extend an encoding's <c>.String</c> with the chart block (if
    /// any) and re-measure <c>.TokenEstimate</c> over the extended form. The
    /// <c>.Json</c> is unchanged — chart data only lives in the string + the
    /// top-level <c>Charts</c> echo.
    /// </summary>
    private static Encoding WithCharts(Encoding encoding, string chartBlock, TokenCounter tokenCounter)
    {
        if (chartBlock.Length == 0) return encoding;
        var s = ChartDescriptors.AppendChartBlock(encoding.String, chartBlock);
        return new Encoding
        {
            String = s,
            Json = encoding.Json,
            TokenEstimate = tokenCounter(s),
        };
    }
}
