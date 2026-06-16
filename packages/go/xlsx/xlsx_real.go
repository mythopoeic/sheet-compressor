//go:build sheetcompressor_excelize

package xlsx

import (
	"archive/zip"
	"bytes"
	"fmt"
	"io"
	"regexp"
	"strconv"
	"strings"

	"github.com/xuri/excelize/v2"

	"github.com/mythopoeic/sheet-compressor/packages/go/sheetcompressor"
)

func readSheetImpl(data []byte, opts Options) (*sheetcompressor.Grid, error) {
	f, err := excelize.OpenReader(bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("xlsx.ReadSheet: open workbook: %w", err)
	}
	defer f.Close()

	sheets := f.GetSheetList()
	if len(sheets) == 0 {
		return nil, fmt.Errorf("xlsx.ReadSheet: workbook contains no sheets")
	}

	var sheetName string
	var sheetIndex int
	if opts.SheetName != "" {
		idx := -1
		for i, name := range sheets {
			if name == opts.SheetName {
				idx = i
				break
			}
		}
		if idx < 0 {
			return nil, fmt.Errorf(
				"xlsx.ReadSheet: sheet %q not found (available: %s)",
				opts.SheetName, strings.Join(sheets, ", "),
			)
		}
		sheetIndex = idx
		sheetName = opts.SheetName
	} else {
		sheetIndex = opts.SheetIndex
		if sheetIndex < 0 || sheetIndex >= len(sheets) {
			return nil, fmt.Errorf(
				"xlsx.ReadSheet: sheet index %d out of range (workbook has %d sheet(s))",
				sheetIndex, len(sheets),
			)
		}
		sheetName = sheets[sheetIndex]
	}

	grid, err := buildGrid(f, sheetName)
	if err != nil {
		return nil, err
	}

	charts, err := extractCharts(data, sheetIndex)
	if err != nil {
		return nil, err
	}
	if len(charts) > 0 {
		grid.Charts = charts
	}
	return grid, nil
}

/* -------------------------------------------------------------------------- */
/* Grid extraction — used range + cell values + per-cell dataType             */
/* -------------------------------------------------------------------------- */

// buildGrid scans the sheet, finds the bounding box of cells with any
// content (value or formula), and emits the Grid + parallel cellMeta.
func buildGrid(f *excelize.File, sheet string) (*sheetcompressor.Grid, error) {
	rows, err := f.GetRows(sheet)
	if err != nil {
		return nil, fmt.Errorf("xlsx.ReadSheet: read rows from %q: %w", sheet, err)
	}

	minRow, minCol, maxRow, maxCol := boundingBox(f, sheet, rows)
	if minRow < 0 {
		// Empty sheet — no used range. Anchor at A1, omit cellMeta.
		return &sheetcompressor.Grid{
			Rows:   [][]string{},
			Origin: sheetcompressor.Origin{Row: 1, Col: 1},
		}, nil
	}

	outRows := make([][]string, 0, maxRow-minRow+1)
	cellMeta := make([][]sheetcompressor.CellMeta, 0, maxRow-minRow+1)
	for r := minRow; r <= maxRow; r++ {
		rowVals := make([]string, maxCol-minCol+1)
		rowMeta := make([]sheetcompressor.CellMeta, maxCol-minCol+1)
		var row []string
		if r-1 < len(rows) {
			row = rows[r-1]
		}
		for c := minCol; c <= maxCol; c++ {
			val := ""
			if c-1 < len(row) {
				val = row[c-1]
			}
			rowVals[c-minCol] = val

			addr := a1(r, c)
			rowMeta[c-minCol] = sheetcompressor.CellMeta{
				DataType: inferDataType(f, sheet, addr, val),
			}
		}
		outRows = append(outRows, rowVals)
		cellMeta = append(cellMeta, rowMeta)
	}

	return &sheetcompressor.Grid{
		Rows:     outRows,
		Origin:   sheetcompressor.Origin{Row: minRow, Col: minCol},
		CellMeta: cellMeta,
	}, nil
}

// boundingBox locates the smallest rectangle covering every "real" cell —
// non-empty value OR explicit cell type OR a formula. Returns (-1,-1,-1,-1)
// when the sheet has no such cells. SetSheetDimension is preferred when the
// workbook explicitly set it; otherwise we scan.
func boundingBox(f *excelize.File, sheet string, rows [][]string) (int, int, int, int) {
	if dim, err := f.GetSheetDimension(sheet); err == nil && dim != "" {
		if mr, mc, xr, xc, ok := parseDimension(dim); ok {
			// Excelize defaults to "A1" when SetSheetDimension wasn't called,
			// so treat a degenerate "A1" as "unset" and fall through to scan.
			if !(mr == 1 && mc == 1 && xr == 1 && xc == 1) {
				return mr, mc, xr, xc
			}
		}
	}

	minRow, minCol, maxRow, maxCol := -1, -1, -1, -1
	for ri, row := range rows {
		r := ri + 1
		for ci, val := range row {
			c := ci + 1
			if val == "" {
				addr := a1(r, c)
				if !cellHasContent(f, sheet, addr) {
					continue
				}
			}
			if minRow < 0 || r < minRow {
				minRow = r
			}
			if maxRow < 0 || r > maxRow {
				maxRow = r
			}
			if minCol < 0 || c < minCol {
				minCol = c
			}
			if maxCol < 0 || c > maxCol {
				maxCol = c
			}
		}
	}
	return minRow, minCol, maxRow, maxCol
}

// cellHasContent treats a cell as "present" when it has a non-empty value,
// any formula, or an explicit non-default type (boolean / date / error /
// string / formula). An untyped cell with no value is a true gap.
func cellHasContent(f *excelize.File, sheet, addr string) bool {
	if formula, _ := f.GetCellFormula(sheet, addr); formula != "" {
		return true
	}
	if val, _ := f.GetCellValue(sheet, addr); val != "" {
		return true
	}
	t, _ := f.GetCellType(sheet, addr)
	return t != excelize.CellTypeUnset
}

var dimRE = regexp.MustCompile(`^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$`)

func parseDimension(dim string) (int, int, int, int, bool) {
	m := dimRE.FindStringSubmatch(dim)
	if m == nil {
		return 0, 0, 0, 0, false
	}
	mr, err := strconv.Atoi(m[2])
	if err != nil {
		return 0, 0, 0, 0, false
	}
	mc := lettersToCol(m[1])
	xr, xc := mr, mc
	if m[3] != "" {
		xr, err = strconv.Atoi(m[4])
		if err != nil {
			return 0, 0, 0, 0, false
		}
		xc = lettersToCol(m[3])
	}
	if mr > xr {
		mr, xr = xr, mr
	}
	if mc > xc {
		mc, xc = xc, mc
	}
	return mr, mc, xr, xc, true
}

// inferDataType maps an excelize CellType to the SPEC §1 DataType vocabulary.
// Formula wins over evaluated type (matching the TS adapter). Excelize emits
// CellTypeUnset for plain numeric cells (the OOXML default has no `t` attr),
// so a non-empty value with Unset type is treated as a number.
func inferDataType(f *excelize.File, sheet, addr, value string) sheetcompressor.DataType {
	formula, _ := f.GetCellFormula(sheet, addr)
	if formula != "" {
		return sheetcompressor.DataTypeFormula
	}
	t, _ := f.GetCellType(sheet, addr)
	switch t {
	case excelize.CellTypeBool:
		return sheetcompressor.DataTypeBool
	case excelize.CellTypeDate:
		return sheetcompressor.DataTypeDate
	case excelize.CellTypeError:
		return sheetcompressor.DataTypeError
	case excelize.CellTypeFormula:
		return sheetcompressor.DataTypeFormula
	case excelize.CellTypeInlineString, excelize.CellTypeSharedString:
		return sheetcompressor.DataTypeText
	case excelize.CellTypeNumber:
		return sheetcompressor.DataTypeNumber
	}
	// CellTypeUnset: empty gap if no value, otherwise OOXML's default numeric.
	if value == "" {
		return sheetcompressor.DataTypeEmpty
	}
	return sheetcompressor.DataTypeNumber
}

/* -------------------------------------------------------------------------- */
/* Address helpers                                                            */
/* -------------------------------------------------------------------------- */

func a1(row, col int) string {
	return colLetters(col) + strconv.Itoa(row)
}

func colLetters(col int) string {
	if col < 1 {
		return ""
	}
	var sb strings.Builder
	out := make([]byte, 0, 4)
	n := col
	for n > 0 {
		rem := (n - 1) % 26
		out = append(out, byte('A'+rem))
		n = (n - 1) / 26
	}
	for i := len(out) - 1; i >= 0; i-- {
		sb.WriteByte(out[i])
	}
	return sb.String()
}

func lettersToCol(letters string) int {
	n := 0
	for _, ch := range letters {
		if ch < 'A' || ch > 'Z' {
			return 0
		}
		n = n*26 + int(ch-'A'+1)
	}
	return n
}

/* -------------------------------------------------------------------------- */
/* Chart extraction                                                           */
/* -------------------------------------------------------------------------- */

// chartTypeMap maps OOXML chart body tags to the SPEC §1 ChartType vocabulary.
// Excelize writes the chart elements WITHOUT the `c:` namespace prefix (default
// namespace), while many other writers — and the TS adapter's fixtures — DO
// prefix them. The regex matchers below accept both forms.
var chartTypeMap = map[string]sheetcompressor.ChartType{
	"barChart":      "bar",
	"bar3DChart":    "bar",
	"lineChart":     "line",
	"line3DChart":   "line",
	"pieChart":      "pie",
	"pie3DChart":    "pie",
	"doughnutChart": "pie",
	"scatterChart":  "scatter",
	"bubbleChart":   "scatter",
	"areaChart":     "area",
	"area3DChart":   "area",
}

type relMap map[string]struct {
	relType string
	target  string
}

// Excelize, SheetJS, and the OOXML spec all write <Relationship>'s
// attributes in different orders (e.g. `Id Target Type` vs `Id Type Target`),
// so we match the element first then pull each attribute by name.
var (
	relElemRE  = regexp.MustCompile(`<Relationship\s+[^>]*?/?>`)
	relAttrRE  = regexp.MustCompile(`\b([A-Za-z]+)="([^"]*)"`)
)

func parseRels(xml string) relMap {
	out := relMap{}
	for _, elem := range relElemRE.FindAllString(xml, -1) {
		attrs := map[string]string{}
		for _, m := range relAttrRE.FindAllStringSubmatch(elem, -1) {
			attrs[m[1]] = m[2]
		}
		id, ok := attrs["Id"]
		if !ok {
			continue
		}
		out[id] = struct {
			relType string
			target  string
		}{relType: attrs["Type"], target: attrs["Target"]}
	}
	return out
}

// resolveRelTarget joins a relationship Target against the part containing it,
// matching the SPEC §8 contract that the rels payload is relative to its
// owning part.
func resolveRelTarget(partPath, target string) string {
	if strings.HasPrefix(target, "/") {
		return strings.TrimLeft(target, "/")
	}
	parentSegs := strings.Split(partPath, "/")
	parentSegs = parentSegs[:len(parentSegs)-1]
	relSegs := strings.Split(target, "/")
	for len(relSegs) > 0 && relSegs[0] == ".." {
		relSegs = relSegs[1:]
		if len(parentSegs) > 0 {
			parentSegs = parentSegs[:len(parentSegs)-1]
		}
	}
	return strings.Join(append(parentSegs, relSegs...), "/")
}

func decodeXMLText(s string) string {
	r := strings.NewReplacer(
		"&lt;", "<",
		"&gt;", ">",
		"&quot;", `"`,
		"&apos;", "'",
		"&amp;", "&",
	)
	return r.Replace(s)
}

var aTextRE = regexp.MustCompile(`<a:t[^>]*>([\s\S]*?)</a:t>`)

// extractRichText concatenates every <a:t>…</a:t> run inside `scope` — every
// chart title block in OOXML is built from one or more runs of formatted text.
func extractRichText(scope string) (string, bool) {
	var parts []string
	for _, m := range aTextRE.FindAllStringSubmatch(scope, -1) {
		parts = append(parts, decodeXMLText(m[1]))
	}
	if len(parts) == 0 {
		return "", false
	}
	return strings.Join(parts, ""), true
}

var titleRE = regexp.MustCompile(`<(?:c:)?title>([\s\S]*?)</(?:c:)?title>`)

func extractTitle(scope string) (string, bool) {
	m := titleRE.FindStringSubmatch(scope)
	if m == nil {
		return "", false
	}
	return extractRichText(m[1])
}

func extractFieldText(xml, tag string) (string, bool) {
	re := regexp.MustCompile(`<(?:c:)?` + tag + `>([\s\S]*?)</(?:c:)?` + tag + `>`)
	m := re.FindStringSubmatch(xml)
	if m == nil {
		return "", false
	}
	return decodeXMLText(strings.TrimSpace(m[1])), true
}

// normalizeRange strips sheet qualifiers and absolute markers from a chart
// cell reference: `Sheet1!$B$2:$B$4` → `B2:B4`.
func normalizeRange(ref string) string {
	if i := strings.LastIndex(ref, "!"); i >= 0 {
		ref = ref[i+1:]
	}
	ref = strings.ReplaceAll(ref, "$", "")
	ref = strings.Trim(ref, "'")
	return ref
}

var (
	chartScopeRE = regexp.MustCompile(`<(?:c:)?chart>([\s\S]*?)</(?:c:)?chart>`)
	plotAreaRE   = regexp.MustCompile(`<(?:c:)?plotArea>[\s\S]*?</(?:c:)?plotArea>`)
	catAxRE      = regexp.MustCompile(`<(?:c:)?(?:catAx|dateAx)>([\s\S]*?)</(?:c:)?(?:catAx|dateAx)>`)
	valAxRE      = regexp.MustCompile(`<(?:c:)?valAx>([\s\S]*?)</(?:c:)?valAx>`)
	serRE        = regexp.MustCompile(`<(?:c:)?ser>([\s\S]*?)</(?:c:)?ser>`)
	txRE         = regexp.MustCompile(`<(?:c:)?tx>([\s\S]*?)</(?:c:)?tx>`)
	valBlockRE   = regexp.MustCompile(`<(?:c:)?val>([\s\S]*?)</(?:c:)?val>`)
	catBlockRE   = regexp.MustCompile(`<(?:c:)?cat>([\s\S]*?)</(?:c:)?cat>`)
)

// parsedChart carries everything parseChartXML can derive from the chart
// part itself. `name` and `anchorRange` come from the parent drawing/anchor.
type parsedChart struct {
	Type       sheetcompressor.ChartType
	Title      string
	HasTitle   bool
	DataRanges []string
	Series     []string
	Axes       sheetcompressor.Axes
	HasAxes    bool
}

func parseChartXML(xml string) parsedChart {
	chartType := sheetcompressor.ChartType("other")
	for tag, t := range chartTypeMap {
		// Accept both `<c:barChart` and `<barChart` (excelize emits the
		// latter when it uses the default namespace).
		re := regexp.MustCompile(`<(?:c:)?` + tag + `[ >]`)
		if re.MatchString(xml) {
			chartType = t
			break
		}
	}

	chartScope := xml
	if m := chartScopeRE.FindStringSubmatch(xml); m != nil {
		chartScope = m[1]
	}
	titleScope := plotAreaRE.ReplaceAllString(chartScope, "")
	title, hasTitle := extractTitle(titleScope)

	var axes sheetcompressor.Axes
	hasAxes := false
	if m := catAxRE.FindStringSubmatch(xml); m != nil {
		if t, ok := extractTitle(m[1]); ok {
			axes.X = &t
			hasAxes = true
		}
	}
	if m := valAxRE.FindStringSubmatch(xml); m != nil {
		if t, ok := extractTitle(m[1]); ok {
			axes.Y = &t
			hasAxes = true
		}
	}

	var series, data []string
	for _, sm := range serRE.FindAllStringSubmatch(xml, -1) {
		ser := sm[1]
		if tx := txRE.FindStringSubmatch(ser); tx != nil {
			if literal, ok := extractFieldText(tx[1], "v"); ok {
				series = append(series, literal)
			} else if cellRef, ok := extractFieldText(tx[1], "f"); ok {
				series = append(series, normalizeRange(cellRef))
			}
		}
		var valBlock string
		if m := valBlockRE.FindStringSubmatch(ser); m != nil {
			valBlock = m[1]
		} else if m := catBlockRE.FindStringSubmatch(ser); m != nil {
			valBlock = m[1]
		}
		if valBlock != "" {
			if cellRef, ok := extractFieldText(valBlock, "f"); ok {
				data = append(data, normalizeRange(cellRef))
			}
		}
	}

	return parsedChart{
		Type:       chartType,
		Title:      title,
		HasTitle:   hasTitle,
		Axes:       axes,
		HasAxes:    hasAxes,
		Series:     series,
		DataRanges: data,
	}
}

var (
	twoCellAnchorRE = regexp.MustCompile(
		`<xdr:(?:twoCellAnchor|oneCellAnchor|absoluteAnchor)\b[\s\S]*?</xdr:(?:twoCellAnchor|oneCellAnchor|absoluteAnchor)>`,
	)
	chartRefRE = regexp.MustCompile(`<c:chart\s+[^>]*?r:id="([^"]+)"`)
	anchorRE   = regexp.MustCompile(
		`<xdr:from>[\s\S]*?<xdr:col>(\d+)</xdr:col>[\s\S]*?<xdr:row>(\d+)</xdr:row>[\s\S]*?</xdr:from>[\s\S]*?<xdr:to>[\s\S]*?<xdr:col>(\d+)</xdr:col>[\s\S]*?<xdr:row>(\d+)</xdr:row>[\s\S]*?</xdr:to>`,
	)
	nameRE       = regexp.MustCompile(`<xdr:cNvPr\s+[^>]*?\bname="([^"]*)"`)
	drawingRefRE = regexp.MustCompile(`<drawing\s+[^>]*?r:id="([^"]+)"`)
)

func anchorRangeFromDrawing(scope string) (string, bool) {
	m := anchorRE.FindStringSubmatch(scope)
	if m == nil {
		return "", false
	}
	fc, _ := strconv.Atoi(m[1])
	fr, _ := strconv.Atoi(m[2])
	tc, _ := strconv.Atoi(m[3])
	tr, _ := strconv.Atoi(m[4])
	return a1(fr+1, fc+1) + ":" + a1(tr+1, tc+1), true
}

func nameFromAnchor(scope string) string {
	m := nameRE.FindStringSubmatch(scope)
	if m == nil {
		return ""
	}
	return m[1]
}

// extractCharts walks the workbook zip directly: locate the drawing part for
// the requested sheet, follow the drawing's chart rels, and parse each chart
// XML part. SPEC §8.1 keeps chart support best-effort; partial descriptors
// (e.g. anchor + type only) are valid output.
func extractCharts(data []byte, sheetIndex int) ([]sheetcompressor.ChartDescriptor, error) {
	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return nil, fmt.Errorf("xlsx.ReadSheet: open zip: %w", err)
	}
	files := map[string][]byte{}
	for _, f := range zr.File {
		rc, err := f.Open()
		if err != nil {
			continue
		}
		b, err := io.ReadAll(rc)
		rc.Close()
		if err != nil {
			continue
		}
		files[f.Name] = b
	}

	sheetPath := fmt.Sprintf("xl/worksheets/sheet%d.xml", sheetIndex+1)
	sheetXML, ok := files[sheetPath]
	if !ok {
		return nil, nil
	}
	dm := drawingRefRE.FindStringSubmatch(string(sheetXML))
	if dm == nil {
		return nil, nil
	}
	drawingRelID := dm[1]

	sheetRelsPath := fmt.Sprintf("xl/worksheets/_rels/sheet%d.xml.rels", sheetIndex+1)
	sheetRels := parseRels(string(files[sheetRelsPath]))
	drawingRel, ok := sheetRels[drawingRelID]
	if !ok {
		return nil, nil
	}
	drawingPath := resolveRelTarget(sheetPath, drawingRel.target)
	drawingXML, ok := files[drawingPath]
	if !ok {
		return nil, nil
	}

	drawingRelsPath := drawingRelsPathFor(drawingPath)
	drawingRels := parseRels(string(files[drawingRelsPath]))

	var charts []sheetcompressor.ChartDescriptor
	for _, anchor := range twoCellAnchorRE.FindAllString(string(drawingXML), -1) {
		chartRefMatch := chartRefRE.FindStringSubmatch(anchor)
		if chartRefMatch == nil {
			continue
		}
		chartRel, ok := drawingRels[chartRefMatch[1]]
		if !ok {
			continue
		}
		chartPath := resolveRelTarget(drawingPath, chartRel.target)
		chartXML, ok := files[chartPath]
		if !ok {
			continue
		}
		anchorRange, ok := anchorRangeFromDrawing(anchor)
		if !ok {
			continue
		}

		parsed := parseChartXML(string(chartXML))
		desc := sheetcompressor.ChartDescriptor{
			Name:        nameFromAnchor(anchor),
			Type:        parsed.Type,
			AnchorRange: anchorRange,
		}
		if parsed.HasTitle {
			t := parsed.Title
			desc.Title = &t
		}
		if len(parsed.DataRanges) > 0 {
			desc.DataRanges = parsed.DataRanges
		}
		if len(parsed.Series) > 0 {
			desc.Series = parsed.Series
		}
		if parsed.HasAxes {
			a := parsed.Axes
			desc.Axes = &a
		}
		charts = append(charts, desc)
	}
	return charts, nil
}

func drawingRelsPathFor(drawingPath string) string {
	idx := strings.LastIndex(drawingPath, "/")
	if idx < 0 {
		return "_rels/" + drawingPath + ".rels"
	}
	return drawingPath[:idx] + "/_rels/" + drawingPath[idx+1:] + ".rels"
}
