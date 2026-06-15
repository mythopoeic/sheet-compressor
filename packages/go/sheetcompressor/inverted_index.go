package sheetcompressor

import "strings"

// pack folds (absoluteRow, absoluteCol) into a single int key for the
// occupancy/assigned sets used by the greedy width-first scan.
func pack(row, col int) int {
	return row*0x100000 + col
}

func encodeInvertedIndex(
	grid *Grid,
	tokenCounter TokenCounter,
) Encoding[InvertedIndexJSON] {
	// Walk the grid in row-major order, bucketing every non-empty cell by
	// value. We track insertion order separately so the final groups list
	// preserves "earliest-cell-first" ordering (SPEC §4.4) — Go's `map`
	// iteration order is intentionally randomized.
	cellsByValue := make(map[string][]int)
	valueOrder := []string{}

	for r, row := range grid.Rows {
		for c, value := range row {
			if value == "" {
				continue
			}
			key := pack(grid.Origin.Row+r, grid.Origin.Col+c)
			if _, seen := cellsByValue[value]; !seen {
				valueOrder = append(valueOrder, value)
			}
			cellsByValue[value] = append(cellsByValue[value], key)
		}
	}

	groups := make([]InvertedIndexGroup, 0, len(valueOrder))
	for _, value := range valueOrder {
		cellKeys := cellsByValue[value]
		present := make(map[int]struct{}, len(cellKeys))
		for _, k := range cellKeys {
			present[k] = struct{}{}
		}
		assigned := make(map[int]struct{})
		var ranges []string

		for _, startKey := range cellKeys {
			if _, taken := assigned[startKey]; taken {
				continue
			}
			startRow := startKey / 0x100000
			startCol := startKey % 0x100000

			// Maximum width: extend right while cells are in the value-set AND
			// not already absorbed by an earlier rectangle from a row above.
			width := 1
			for {
				k := pack(startRow, startCol+width)
				_, inPresent := present[k]
				_, inAssigned := assigned[k]
				if !inPresent || inAssigned {
					break
				}
				width++
			}

			// Maximum height: extend down while every cell in the row of
			// `width` cells is still in the value-set and unassigned.
			height := 1
			for {
				nextRow := startRow + height
				canExtend := true
				for dc := 0; dc < width; dc++ {
					k := pack(nextRow, startCol+dc)
					_, inPresent := present[k]
					_, inAssigned := assigned[k]
					if !inPresent || inAssigned {
						canExtend = false
						break
					}
				}
				if !canExtend {
					break
				}
				height++
			}

			for dr := 0; dr < height; dr++ {
				for dc := 0; dc < width; dc++ {
					assigned[pack(startRow+dr, startCol+dc)] = struct{}{}
				}
			}

			topLeft := a1(startRow, startCol)
			if width == 1 && height == 1 {
				ranges = append(ranges, topLeft)
			} else {
				ranges = append(
					ranges,
					topLeft+":"+a1(startRow+height-1, startCol+width-1),
				)
			}
		}

		groups = append(groups, InvertedIndexGroup{Value: value, Ranges: ranges})
	}

	lineParts := make([]string, len(groups))
	for i, g := range groups {
		lineParts[i] = strings.Join(g.Ranges, "|") + "," + escapeValue(g.Value)
	}
	s := strings.Join(lineParts, "\n")

	j := InvertedIndexJSON{
		Encoding: "inverted-index",
		Version:  0,
		Origin:   grid.Origin,
		Groups:   groups,
	}
	return Encoding[InvertedIndexJSON]{String: s, JSON: j, TokenEstimate: tokenCounter(s)}
}
