package sheetcompressor

import (
	"regexp"
	"strings"
)

// typeOrder is SPEC §5.1's canonical emission order. Groups with zero ranges
// are omitted from the output; everything else appears in this order.
var typeOrder = [...]FormatType{
	FormatTypeIntNum,
	FormatTypeFloatNum,
	FormatTypeScientificNum,
	FormatTypePercentageNum,
	FormatTypeCurrencyData,
	FormatTypeDateData,
	FormatTypeTimeData,
	FormatTypeYearData,
	FormatTypeEmailData,
	FormatTypeBoolean,
	FormatTypeText,
}

// Classification patterns from SPEC §5.1. Probed in priority order — first
// match wins. Examples that drive the ordering:
//   - "1900" matches both Year and Int — Year is more specific.
//   - "1.5e10" matches Scientific, not Float.
//   - "$5" matches Currency, not Int.
var (
	booleanRE    = regexp.MustCompile(`^(?i:true|false)$`)
	emailRE      = regexp.MustCompile(`^[^\s@]+@[^\s@]+\.[^\s@]+$`)
	scientificRE = regexp.MustCompile(`^-?\d+(\.\d+)?[eE][+-]?\d+$`)
	percentRE    = regexp.MustCompile(`^-?\d+(\.\d+)?%$`)
	currencyRE   = regexp.MustCompile(`^-?[$€£¥]\d+(\.\d+)?$`)
	dateISORE    = regexp.MustCompile(`^\d{4}-\d{1,2}-\d{1,2}$`)
	dateSlashRE  = regexp.MustCompile(`^\d{1,2}/\d{1,2}/\d{2,4}$`)
	dateDashRE   = regexp.MustCompile(`^\d{1,2}-\d{1,2}-\d{2,4}$`)
	time12RE     = regexp.MustCompile(`^\d{1,2}:\d{2}(:\d{2})?\s?(AM|PM|am|pm)$`)
	time24RE     = regexp.MustCompile(`^\d{1,2}:\d{2}(:\d{2})?$`)
	yearRE       = regexp.MustCompile(`^(19|20)\d{2}$`)
	floatRE      = regexp.MustCompile(`^-?(\d+\.\d*|\.\d+)$`)
	intRE        = regexp.MustCompile(`^-?\d+$`)

	// Year-header signal from SPEC §5.1.1, matched case-insensitively.
	// "yy-mm" deliberately doesn't match (would tag a month-year date
	// column as a year column).
	yearHeaderRE = regexp.MustCompile(`(?i)\b(years?|yr|yyyy|fy|fiscal\s*years?)\b`)
)

// classify is SPEC §5.1's value-only classifier. A 4-digit value in
// 1900–2099 is reported as YearData candidate; whether it stays a year is
// decided by context in resolveYear. Returns ("", false) for the empty string.
func classify(v string) (FormatType, bool) {
	if v == "" {
		return "", false
	}
	switch {
	case booleanRE.MatchString(v):
		return FormatTypeBoolean, true
	case emailRE.MatchString(v):
		return FormatTypeEmailData, true
	case scientificRE.MatchString(v):
		return FormatTypeScientificNum, true
	case percentRE.MatchString(v):
		return FormatTypePercentageNum, true
	case currencyRE.MatchString(v):
		return FormatTypeCurrencyData, true
	case dateISORE.MatchString(v) || dateSlashRE.MatchString(v) || dateDashRE.MatchString(v):
		return FormatTypeDateData, true
	case time12RE.MatchString(v) || time24RE.MatchString(v):
		return FormatTypeTimeData, true
	case yearRE.MatchString(v):
		return FormatTypeYearData, true
	case floatRE.MatchString(v):
		return FormatTypeFloatNum, true
	case intRE.MatchString(v):
		return FormatTypeIntNum, true
	}
	return FormatTypeText, true
}

// nearestHeaderAbove finds the column header governing (r, c): the nearest
// non-empty cell ABOVE it in the same column whose value classifies as Text.
// Skips blanks and numeric cells so a header above intervening data is still
// found. Returns ("", false) when no header exists.
func nearestHeaderAbove(grid *Grid, r, c int) (string, bool) {
	for rr := r - 1; rr >= 0; rr-- {
		v := cellAt(grid, rr, c)
		if v == "" {
			continue
		}
		t, ok := classify(v)
		if ok && t == FormatTypeText {
			return v, true
		}
	}
	return "", false
}

// resolveYear decides whether a year *candidate* at (r, c) is really
// YearData or an ordinary IntNum (SPEC §5.1.1).
func resolveYear(grid *Grid, r, c int) FormatType {
	if header, ok := nearestHeaderAbove(grid, r, c); ok {
		if yearHeaderRE.MatchString(header) {
			return FormatTypeYearData
		}
		return FormatTypeIntNum
	}

	intSiblings := 0
	yearSiblings := 0
	for rr := 0; rr < len(grid.Rows); rr++ {
		if rr == r {
			continue
		}
		t, ok := classify(cellAt(grid, rr, c))
		if !ok {
			continue
		}
		switch t {
		case FormatTypeYearData:
			intSiblings++
			yearSiblings++
		case FormatTypeIntNum:
			intSiblings++
		}
	}
	if intSiblings == 0 {
		return FormatTypeIntNum
	}
	if yearSiblings == intSiblings {
		return FormatTypeYearData
	}
	return FormatTypeIntNum
}

type rect struct {
	t         FormatType
	topRow    int
	leftCol   int
	bottomRow int
	rightCol  int
}

func aggregate(grid *Grid) []rect {
	rowCount, colCount := gridDimensions(grid)
	if rowCount == 0 || colCount == 0 {
		return nil
	}

	// types[r][c] is the format type of (r, c) or "" for empty.
	types := make([][]FormatType, rowCount)
	for r := 0; r < rowCount; r++ {
		row := make([]FormatType, colCount)
		for c := 0; c < colCount; c++ {
			if t, ok := classify(cellAt(grid, r, c)); ok {
				row[c] = t
			} else {
				row[c] = ""
			}
		}
		types[r] = row
	}

	// SPEC §5.1.1: year disambiguation. A value-level YearData stays a year
	// only when the column header / neighbours support it.
	for r := 0; r < rowCount; r++ {
		for c := 0; c < colCount; c++ {
			if types[r][c] == FormatTypeYearData {
				types[r][c] = resolveYear(grid, r, c)
			}
		}
	}

	claimed := make([][]bool, rowCount)
	for r := 0; r < rowCount; r++ {
		claimed[r] = make([]bool, colCount)
	}

	var rects []rect

	for r := 0; r < rowCount; r++ {
		for c := 0; c < colCount; c++ {
			if claimed[r][c] {
				continue
			}
			t := types[r][c]
			if t == "" {
				continue
			}

			// Extend right along row r.
			w := 1
			for c+w < colCount && types[r][c+w] == t && !claimed[r][c+w] {
				w++
			}

			// Extend down: every candidate row must be fully same-type AND
			// unclaimed across the [c, c+w) span.
			h := 1
			for r+h < rowCount {
				rowOK := true
				for cc := c; cc < c+w; cc++ {
					if types[r+h][cc] != t || claimed[r+h][cc] {
						rowOK = false
						break
					}
				}
				if !rowOK {
					break
				}
				h++
			}

			for rr := r; rr < r+h; rr++ {
				for cc := c; cc < c+w; cc++ {
					claimed[rr][cc] = true
				}
			}

			rects = append(rects, rect{
				t:         t,
				topRow:    r,
				leftCol:   c,
				bottomRow: r + h - 1,
				rightCol:  c + w - 1,
			})
		}
	}

	return rects
}

func rectToRange(rc rect, origin Origin) string {
	topLeft := a1(origin.Row+rc.topRow, origin.Col+rc.leftCol)
	if rc.topRow == rc.bottomRow && rc.leftCol == rc.rightCol {
		return topLeft
	}
	bottomRight := a1(origin.Row+rc.bottomRow, origin.Col+rc.rightCol)
	return topLeft + ":" + bottomRight
}

func encodeFormatAggregation(
	grid *Grid,
	tokenCounter TokenCounter,
) Encoding[FormatAggregationJSON] {
	rects := aggregate(grid)

	byType := make(map[FormatType][]string)
	for _, rc := range rects {
		byType[rc.t] = append(byType[rc.t], rectToRange(rc, grid.Origin))
	}

	groups := make([]FormatAggregationGroup, 0, len(byType))
	for _, t := range typeOrder {
		ranges, ok := byType[t]
		if !ok || len(ranges) == 0 {
			continue
		}
		groups = append(groups, FormatAggregationGroup{Type: t, Ranges: ranges})
	}

	lineParts := make([]string, len(groups))
	for i, g := range groups {
		lineParts[i] = string(g.Type) + ": " + strings.Join(g.Ranges, ",")
	}
	s := strings.Join(lineParts, "\n")

	j := FormatAggregationJSON{
		Encoding: "format-aggregation",
		Version:  0,
		Origin:   grid.Origin,
		Groups:   groups,
	}
	return Encoding[FormatAggregationJSON]{String: s, JSON: j, TokenEstimate: tokenCounter(s)}
}
