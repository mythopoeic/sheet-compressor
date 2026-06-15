package sheetcompressor

import "regexp"

// SPEC §3.1.2 phase-1 parameters.
const (
	phase1K              = 4
	phase1HetThreshold   = 0.5
)

// SPEC §3.1.2: when CellMeta.DataType is absent we infer from the raw string.
// Only three buckets in v0 (empty / number / text) so every language port
// agrees on the heterogeneity-anchor and type-transition tests byte-for-byte.
var numericRE = regexp.MustCompile(`^-?\d+(\.\d+)?$`)

func inferType(value string) DataType {
	if value == "" {
		return DataTypeEmpty
	}
	if numericRE.MatchString(value) {
		return DataTypeNumber
	}
	return DataTypeText
}

// gridDimensions returns (rowCount, maxColCount). Empty rows still count
// toward rowCount; the column count is the longest row's length so ragged
// trailing cells aren't silently truncated.
func gridDimensions(grid *Grid) (int, int) {
	rowCount := len(grid.Rows)
	colCount := 0
	for _, row := range grid.Rows {
		if len(row) > colCount {
			colCount = len(row)
		}
	}
	return rowCount, colCount
}

// cellAt safely indexes the grid; gaps and ragged rows return "".
func cellAt(grid *Grid, r, c int) string {
	if r < 0 || r >= len(grid.Rows) {
		return ""
	}
	row := grid.Rows[r]
	if c < 0 || c >= len(row) {
		return ""
	}
	return row[c]
}

// typeAt returns the cell's data type for phase-1 anchor detection. The
// explicit `cellMeta.dataType` wins if present; otherwise the type is
// inferred from the raw string.
func typeAt(grid *Grid, r, c int) DataType {
	if grid.CellMeta != nil && r >= 0 && r < len(grid.CellMeta) {
		row := grid.CellMeta[r]
		if c >= 0 && c < len(row) {
			t := row[c].DataType
			if t != "" {
				return t
			}
		}
	}
	return inferType(cellAt(grid, r, c))
}

// keepAllStrategy implements SPEC §3.1.1 — every row/col index is kept.
type keepAllStrategy struct{}

// KeepAllStrategy is the SPEC §3.1.1 strategy: opt out of anchor detection.
var KeepAllStrategy AnchorStrategy = keepAllStrategy{}

func (keepAllStrategy) Name() string { return "keep-all" }

func (keepAllStrategy) Detect(grid *Grid) AnchorDetection {
	rowCount, colCount := gridDimensions(grid)
	keptRows := make(map[int]struct{}, rowCount)
	for r := 0; r < rowCount; r++ {
		keptRows[r] = struct{}{}
	}
	keptCols := make(map[int]struct{}, colCount)
	for c := 0; c < colCount; c++ {
		keptCols[c] = struct{}{}
	}
	return AnchorDetection{KeptRows: keptRows, KeptCols: keptCols}
}

// phase1Strategy implements SPEC §3.1.2 — heterogeneity + type-transition
// anchors, k=4 neighborhood expansion, then a blank-row/col prune pass.
type phase1Strategy struct{}

// Phase1Strategy is the SPEC §3.1.2 default detector.
var Phase1Strategy AnchorStrategy = phase1Strategy{}

func (phase1Strategy) Name() string { return "phase1" }

func (phase1Strategy) Detect(grid *Grid) AnchorDetection {
	rowCount, colCount := gridDimensions(grid)
	if rowCount == 0 || colCount == 0 {
		return AnchorDetection{
			KeptRows: map[int]struct{}{},
			KeptCols: map[int]struct{}{},
		}
	}

	// Heterogeneity anchors (rows).
	anchorRows := make(map[int]struct{})
	for r := 0; r < rowCount; r++ {
		vals := make([]string, colCount)
		for c := 0; c < colCount; c++ {
			vals[c] = cellAt(grid, r, c)
		}
		if heterogeneity(vals) >= phase1HetThreshold {
			anchorRows[r] = struct{}{}
		}
	}
	// Type-transition anchors (rows).
	for r := 1; r < rowCount; r++ {
		differs := false
		for c := 0; c < colCount; c++ {
			if typeAt(grid, r-1, c) != typeAt(grid, r, c) {
				differs = true
				break
			}
		}
		if differs {
			anchorRows[r-1] = struct{}{}
			anchorRows[r] = struct{}{}
		}
	}

	// Heterogeneity anchors (cols).
	anchorCols := make(map[int]struct{})
	for c := 0; c < colCount; c++ {
		vals := make([]string, rowCount)
		for r := 0; r < rowCount; r++ {
			vals[r] = cellAt(grid, r, c)
		}
		if heterogeneity(vals) >= phase1HetThreshold {
			anchorCols[c] = struct{}{}
		}
	}
	// Type-transition anchors (cols).
	for c := 1; c < colCount; c++ {
		differs := false
		for r := 0; r < rowCount; r++ {
			if typeAt(grid, r, c-1) != typeAt(grid, r, c) {
				differs = true
				break
			}
		}
		if differs {
			anchorCols[c-1] = struct{}{}
			anchorCols[c] = struct{}{}
		}
	}

	keptRows := expandNeighborhood(anchorRows, rowCount, phase1K)
	keptCols := expandNeighborhood(anchorCols, colCount, phase1K)

	// Prune entirely-blank rows / cols within the kept region. Rows first,
	// then cols — single pass per SPEC §3.1.2 step 4.
	for r := range keptRows {
		hasContent := false
		for c := range keptCols {
			if cellAt(grid, r, c) != "" {
				hasContent = true
				break
			}
		}
		if !hasContent {
			delete(keptRows, r)
		}
	}
	for c := range keptCols {
		hasContent := false
		for r := range keptRows {
			if cellAt(grid, r, c) != "" {
				hasContent = true
				break
			}
		}
		if !hasContent {
			delete(keptCols, c)
		}
	}

	return AnchorDetection{KeptRows: keptRows, KeptCols: keptCols}
}

func heterogeneity(values []string) float64 {
	nonEmpty := 0
	seen := make(map[string]struct{})
	for _, v := range values {
		if v == "" {
			continue
		}
		nonEmpty++
		seen[v] = struct{}{}
	}
	if nonEmpty == 0 {
		return 0
	}
	return float64(len(seen)) / float64(nonEmpty)
}

func expandNeighborhood(anchors map[int]struct{}, size, k int) map[int]struct{} {
	kept := make(map[int]struct{})
	for a := range anchors {
		lo := a - k
		if lo < 0 {
			lo = 0
		}
		hi := a + k
		if hi > size-1 {
			hi = size - 1
		}
		for i := lo; i <= hi; i++ {
			kept[i] = struct{}{}
		}
	}
	return kept
}

// ResolveStrategy picks the active strategy. nil → phase1 (the default).
func ResolveStrategy(s AnchorStrategy) AnchorStrategy {
	if s == nil {
		return Phase1Strategy
	}
	return s
}
