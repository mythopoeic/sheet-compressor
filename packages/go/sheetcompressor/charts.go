package sheetcompressor

import "strings"

// renderChartToken renders a single ChartDescriptor to the SPEC §6.1 token
// form. Optional fields are omitted when nil/empty. The `name` field is
// intentionally not rendered (developer-facing only).
func renderChartToken(c ChartDescriptor) string {
	var sb strings.Builder
	sb.WriteString("CHART(")
	sb.WriteString(string(c.Type))
	sb.WriteString(")@")
	sb.WriteString(c.AnchorRange)
	if c.Title != nil {
		sb.WriteString(` title="`)
		sb.WriteString(escapeQuoted(*c.Title))
		sb.WriteString(`"`)
	}
	if len(c.DataRanges) > 0 {
		sb.WriteString(" data=")
		sb.WriteString(strings.Join(c.DataRanges, ","))
	}
	if len(c.Series) > 0 {
		sb.WriteString(" series=[")
		for i, s := range c.Series {
			if i > 0 {
				sb.WriteString(",")
			}
			sb.WriteString(escapeSeriesName(s))
		}
		sb.WriteString("]")
	}
	if c.Axes != nil {
		if c.Axes.X != nil {
			sb.WriteString(` xAxis="`)
			sb.WriteString(escapeQuoted(*c.Axes.X))
			sb.WriteString(`"`)
		}
		if c.Axes.Y != nil {
			sb.WriteString(` yAxis="`)
			sb.WriteString(escapeQuoted(*c.Axes.Y))
			sb.WriteString(`"`)
		}
	}
	return sb.String()
}

// renderChartBlock joins every chart's token with "\n", no trailing newline.
// Returns "" when charts is nil or empty.
func renderChartBlock(charts []ChartDescriptor) string {
	if len(charts) == 0 {
		return ""
	}
	parts := make([]string, len(charts))
	for i, c := range charts {
		parts[i] = renderChartToken(c)
	}
	return strings.Join(parts, "\n")
}

// appendChartBlock applies SPEC §6.2's join rule: the chart block follows the
// cell string on a new line; either side may be empty.
func appendChartBlock(cellString, chartBlock string) string {
	if chartBlock == "" {
		return cellString
	}
	if cellString == "" {
		return chartBlock
	}
	return cellString + "\n" + chartBlock
}
