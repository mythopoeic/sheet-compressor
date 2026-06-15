package sheetcompressor

import "strings"

// vanillaEncode is SPEC §7's un-compressed baseline: rows joined with " | ",
// no escaping, no addresses. Used for rawBaseline.tokenEstimate.
func vanillaEncode(grid *Grid) string {
	lines := make([]string, len(grid.Rows))
	for i, row := range grid.Rows {
		lines[i] = strings.Join(row, " | ")
	}
	return strings.Join(lines, "\n")
}
