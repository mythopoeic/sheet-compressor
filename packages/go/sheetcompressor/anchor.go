package sheetcompressor

import "strings"

func encodeAnchor(
	grid *Grid,
	detection AnchorDetection,
	tokenCounter TokenCounter,
) Encoding[AnchorJSON] {
	// Pre-size to avoid the common "tiny grid → many tiny appends" allocations.
	cells := make([]AnchorCell, 0)
	var lines []string

	for r, row := range grid.Rows {
		if _, ok := detection.KeptRows[r]; !ok {
			continue
		}
		var tokens []string
		for c := 0; c < len(row); c++ {
			if _, ok := detection.KeptCols[c]; !ok {
				continue
			}
			value := row[c]
			// SPEC §3.1: only literal "" is empty.
			if value == "" {
				continue
			}
			address := a1(grid.Origin.Row+r, grid.Origin.Col+c)
			cells = append(cells, AnchorCell{Address: address, Value: value})
			tokens = append(tokens, address+","+escapeValue(value))
		}
		// SPEC §3.2: fully-empty rows are dropped (no blank line emitted).
		if len(tokens) > 0 {
			lines = append(lines, strings.Join(tokens, "|"))
		}
	}

	s := strings.Join(lines, "\n")
	j := AnchorJSON{
		Encoding: "anchor-skeleton",
		Version:  0,
		Origin:   grid.Origin,
		Cells:    cells,
	}
	return Encoding[AnchorJSON]{String: s, JSON: j, TokenEstimate: tokenCounter(s)}
}
