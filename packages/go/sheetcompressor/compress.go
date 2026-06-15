package sheetcompressor

// Compress is SPEC §2's top-level entry point. It runs all three encodings
// and returns the result struct verbatim. Both fields of `Options` are
// optional: nil AnchorStrategy → phase1; nil TokenCounter → the SPEC §7
// heuristic.
func Compress(grid *Grid, opts Options) CompressResult {
	strategy := ResolveStrategy(opts.AnchorStrategy)
	detection := strategy.Detect(grid)
	tokenCounter := opts.TokenCounter
	if tokenCounter == nil {
		tokenCounter = EstimateTokens
	}

	chartBlock := renderChartBlock(grid.Charts)

	anchor := encodeAnchor(grid, detection, tokenCounter)
	invIdx := encodeInvertedIndex(grid, tokenCounter)
	formatAgg := encodeFormatAggregation(grid, tokenCounter)

	anchor = withCharts(anchor, chartBlock, tokenCounter)
	invIdx = withChartsInv(invIdx, chartBlock, tokenCounter)
	formatAgg = withChartsFmt(formatAgg, chartBlock, tokenCounter)

	// `Charts` always materialises as a non-nil slice so JSON serialisation
	// emits `[]` rather than `null` when the input had no charts.
	charts := []ChartDescriptor{}
	if len(grid.Charts) > 0 {
		charts = append(charts, grid.Charts...)
	}

	res := CompressResult{
		Anchor:            anchor,
		InvertedIndex:     invIdx,
		FormatAggregation: formatAgg,
		Charts:            charts,
	}
	res.RawBaseline.TokenEstimate = tokenCounter(vanillaEncode(grid))
	return res
}

// withCharts / withChartsInv / withChartsFmt: SPEC §6.2 — splice the chart
// block onto the cell-string and re-measure tokens over the extended form.
// Three near-identical helpers because Go generics don't let us share a
// single function across the encoding-specific JSON types here.
func withCharts(e Encoding[AnchorJSON], block string, tc TokenCounter) Encoding[AnchorJSON] {
	if block == "" {
		return e
	}
	s := appendChartBlock(e.String, block)
	return Encoding[AnchorJSON]{String: s, JSON: e.JSON, TokenEstimate: tc(s)}
}

func withChartsInv(e Encoding[InvertedIndexJSON], block string, tc TokenCounter) Encoding[InvertedIndexJSON] {
	if block == "" {
		return e
	}
	s := appendChartBlock(e.String, block)
	return Encoding[InvertedIndexJSON]{String: s, JSON: e.JSON, TokenEstimate: tc(s)}
}

func withChartsFmt(e Encoding[FormatAggregationJSON], block string, tc TokenCounter) Encoding[FormatAggregationJSON] {
	if block == "" {
		return e
	}
	s := appendChartBlock(e.String, block)
	return Encoding[FormatAggregationJSON]{String: s, JSON: e.JSON, TokenEstimate: tc(s)}
}
