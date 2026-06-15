//go:build sheetcompressor_excelize

package xlsx

import (
	"bytes"
	"errors"
	"reflect"
	"testing"

	"github.com/xuri/excelize/v2"

	"github.com/mythopoeic/sheet-compressor/packages/go/sheetcompressor"
)

/* -------------------------------------------------------------------------- */
/* Test helpers — build small in-memory .xlsx files using excelize itself.    */
/*                                                                            */
/* The adapter is tested against bytes excelize produces (round-trip), so a   */
/* future excelize bump or behaviour change surfaces here loudly. Asserts     */
/* are on the Grid (rows, origin, cellMeta, charts) — NEVER on the            */
/* compressed output (see SPEC §8.3).                                         */
/* -------------------------------------------------------------------------- */

func writeWorkbook(t *testing.T, build func(f *excelize.File)) []byte {
	t.Helper()
	f := excelize.NewFile()
	t.Cleanup(func() { _ = f.Close() })
	build(f)
	var buf bytes.Buffer
	if err := f.Write(&buf); err != nil {
		t.Fatalf("excelize write: %v", err)
	}
	return buf.Bytes()
}

func mustRead(t *testing.T, data []byte, opts Options) *sheetcompressor.Grid {
	t.Helper()
	g, err := ReadSheet(data, opts)
	if err != nil {
		t.Fatalf("ReadSheet: %v", err)
	}
	return g
}

func dataTypes(meta [][]sheetcompressor.CellMeta) [][]sheetcompressor.DataType {
	out := make([][]sheetcompressor.DataType, len(meta))
	for i, row := range meta {
		out[i] = make([]sheetcompressor.DataType, len(row))
		for j, m := range row {
			out[i][j] = m.DataType
		}
	}
	return out
}

/* -------------------------------------------------------------------------- */
/* Empty / minimal workbooks                                                  */
/* -------------------------------------------------------------------------- */

func TestReadSheet_EmptyWorkbook(t *testing.T) {
	data := writeWorkbook(t, func(f *excelize.File) {})
	g := mustRead(t, data, Options{})
	if len(g.Rows) != 0 {
		t.Errorf("expected empty Rows, got %#v", g.Rows)
	}
	if g.Origin != (sheetcompressor.Origin{Row: 1, Col: 1}) {
		t.Errorf("expected origin {1,1}, got %+v", g.Origin)
	}
	if g.CellMeta != nil {
		t.Errorf("expected nil CellMeta for empty sheet, got %#v", g.CellMeta)
	}
	if len(g.Charts) != 0 {
		t.Errorf("expected no charts, got %d", len(g.Charts))
	}
}

func TestReadSheet_A1AnchoredGrid(t *testing.T) {
	data := writeWorkbook(t, func(f *excelize.File) {
		f.SetCellValue("Sheet1", "A1", "Name")
		f.SetCellValue("Sheet1", "B1", "Qty")
		f.SetCellValue("Sheet1", "A2", "Apple")
		f.SetCellValue("Sheet1", "B2", 3)
	})
	g := mustRead(t, data, Options{})
	if g.Origin != (sheetcompressor.Origin{Row: 1, Col: 1}) {
		t.Errorf("expected origin {1,1}, got %+v", g.Origin)
	}
	want := [][]string{
		{"Name", "Qty"},
		{"Apple", "3"},
	}
	if !reflect.DeepEqual(g.Rows, want) {
		t.Errorf("rows mismatch\n got: %#v\nwant: %#v", g.Rows, want)
	}
}

func TestReadSheet_RespectsTrueOrigin(t *testing.T) {
	data := writeWorkbook(t, func(f *excelize.File) {
		f.SetCellValue("Sheet1", "C5", "Name")
		f.SetCellValue("Sheet1", "D5", "Qty")
		f.SetCellValue("Sheet1", "C6", "Apple")
		f.SetCellValue("Sheet1", "D6", 3)
	})
	g := mustRead(t, data, Options{})
	if g.Origin != (sheetcompressor.Origin{Row: 5, Col: 3}) {
		t.Errorf("expected origin {5,3}, got %+v", g.Origin)
	}
	want := [][]string{
		{"Name", "Qty"},
		{"Apple", "3"},
	}
	if !reflect.DeepEqual(g.Rows, want) {
		t.Errorf("rows mismatch\n got: %#v\nwant: %#v", g.Rows, want)
	}
}

func TestReadSheet_FillsInternalGapsAsEmpty(t *testing.T) {
	// Row 1 has only B1; row 2 has A2 and C2. Used range is A1:C2; gaps inside
	// must surface as "" so downstream stages see a rectangular grid.
	data := writeWorkbook(t, func(f *excelize.File) {
		f.SetCellValue("Sheet1", "B1", "B1val")
		f.SetCellValue("Sheet1", "A2", "A2val")
		f.SetCellValue("Sheet1", "C2", 7)
	})
	g := mustRead(t, data, Options{})
	want := [][]string{
		{"", "B1val", ""},
		{"A2val", "", "7"},
	}
	if !reflect.DeepEqual(g.Rows, want) {
		t.Errorf("rows mismatch\n got: %#v\nwant: %#v", g.Rows, want)
	}
	if g.Origin != (sheetcompressor.Origin{Row: 1, Col: 1}) {
		t.Errorf("expected origin {1,1}, got %+v", g.Origin)
	}
}

/* -------------------------------------------------------------------------- */
/* Sheet selection                                                            */
/* -------------------------------------------------------------------------- */

func TestReadSheet_DefaultsToFirstSheet(t *testing.T) {
	data := writeWorkbook(t, func(f *excelize.File) {
		f.SetCellValue("Sheet1", "A1", "A")
		f.NewSheet("Second")
		f.SetCellValue("Second", "A1", "B")
	})
	g := mustRead(t, data, Options{})
	if got, want := g.Rows[0][0], "A"; got != want {
		t.Errorf("expected first-sheet value %q, got %q", want, got)
	}
}

func TestReadSheet_SelectByName(t *testing.T) {
	data := writeWorkbook(t, func(f *excelize.File) {
		f.SetCellValue("Sheet1", "A1", "A")
		f.NewSheet("Second")
		f.SetCellValue("Second", "A1", "B")
	})
	g := mustRead(t, data, Options{SheetName: "Second"})
	if got, want := g.Rows[0][0], "B"; got != want {
		t.Errorf("expected second-sheet value %q, got %q", want, got)
	}
}

func TestReadSheet_SelectByIndex(t *testing.T) {
	data := writeWorkbook(t, func(f *excelize.File) {
		f.SetCellValue("Sheet1", "A1", "A")
		f.NewSheet("Second")
		f.SetCellValue("Second", "A1", "B")
	})
	g := mustRead(t, data, Options{SheetIndex: 1})
	if got, want := g.Rows[0][0], "B"; got != want {
		t.Errorf("expected index-1 value %q, got %q", want, got)
	}
}

func TestReadSheet_UnknownSheetName(t *testing.T) {
	data := writeWorkbook(t, func(f *excelize.File) {
		f.SetCellValue("Sheet1", "A1", "A")
	})
	if _, err := ReadSheet(data, Options{SheetName: "Missing"}); err == nil {
		t.Fatal("expected error for unknown sheet name, got nil")
	}
}

func TestReadSheet_IndexOutOfRange(t *testing.T) {
	data := writeWorkbook(t, func(f *excelize.File) {
		f.SetCellValue("Sheet1", "A1", "A")
	})
	if _, err := ReadSheet(data, Options{SheetIndex: 5}); err == nil {
		t.Fatal("expected error for out-of-range index, got nil")
	}
}

/* -------------------------------------------------------------------------- */
/* cellMeta dataType                                                          */
/* -------------------------------------------------------------------------- */

func TestReadSheet_DataTypeMapping(t *testing.T) {
	data := writeWorkbook(t, func(f *excelize.File) {
		f.SetCellValue("Sheet1", "A1", "hello") // text
		f.SetCellValue("Sheet1", "B1", 42)      // number
		f.SetCellBool("Sheet1", "C1", true)     // bool
		f.SetCellFormula("Sheet1", "D1", "=1+1")
	})
	g := mustRead(t, data, Options{})
	if g.CellMeta == nil {
		t.Fatal("expected cellMeta")
	}
	got := dataTypes(g.CellMeta)
	want := [][]sheetcompressor.DataType{
		{
			sheetcompressor.DataTypeText,
			sheetcompressor.DataTypeNumber,
			sheetcompressor.DataTypeBool,
			sheetcompressor.DataTypeFormula,
		},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("dataType mismatch\n got: %#v\nwant: %#v", got, want)
	}
}

func TestReadSheet_GapCellsAreEmpty(t *testing.T) {
	// Used range A1:C1 with a gap at B1 → meta has dataType="empty" in the middle.
	data := writeWorkbook(t, func(f *excelize.File) {
		f.SetCellValue("Sheet1", "A1", "x")
		f.SetCellValue("Sheet1", "C1", 3)
	})
	g := mustRead(t, data, Options{})
	if g.CellMeta == nil {
		t.Fatal("expected cellMeta")
	}
	got := dataTypes(g.CellMeta)
	want := [][]sheetcompressor.DataType{
		{
			sheetcompressor.DataTypeText,
			sheetcompressor.DataTypeEmpty,
			sheetcompressor.DataTypeNumber,
		},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("dataType mismatch\n got: %#v\nwant: %#v", got, want)
	}
}

func TestReadSheet_OmitsCellMetaForEmptySheet(t *testing.T) {
	data := writeWorkbook(t, func(f *excelize.File) {})
	g := mustRead(t, data, Options{})
	if g.CellMeta != nil {
		t.Errorf("expected nil CellMeta on empty sheet, got %#v", g.CellMeta)
	}
}

/* -------------------------------------------------------------------------- */
/* Chart extraction                                                           */
/* -------------------------------------------------------------------------- */

func TestReadSheet_ExtractsBarChartWithTitleAxesSeries(t *testing.T) {
	data := writeWorkbook(t, func(f *excelize.File) {
		f.SetCellValue("Sheet1", "A1", "Quarter")
		f.SetCellValue("Sheet1", "B1", "Sales")
		f.SetCellValue("Sheet1", "A2", "Q1")
		f.SetCellValue("Sheet1", "B2", 100)
		f.SetCellValue("Sheet1", "A3", "Q2")
		f.SetCellValue("Sheet1", "B3", 150)
		if err := f.AddChart("Sheet1", "B5", &excelize.Chart{
			Type:  excelize.Bar,
			Title: []excelize.RichTextRun{{Text: "Sales"}},
			Series: []excelize.ChartSeries{
				{
					Name:       "Sheet1!$B$1",
					Categories: "Sheet1!$A$2:$A$3",
					Values:     "Sheet1!$B$2:$B$3",
				},
			},
			XAxis: excelize.ChartAxis{Title: []excelize.RichTextRun{{Text: "Quarter"}}},
			YAxis: excelize.ChartAxis{Title: []excelize.RichTextRun{{Text: "Amount"}}},
		}); err != nil {
			t.Fatalf("AddChart: %v", err)
		}
	})
	g := mustRead(t, data, Options{})
	if len(g.Charts) != 1 {
		t.Fatalf("expected 1 chart, got %d", len(g.Charts))
	}
	c := g.Charts[0]
	if c.Type != "bar" {
		t.Errorf("expected type bar, got %s", c.Type)
	}
	if c.AnchorRange == "" {
		t.Errorf("expected non-empty anchorRange")
	}
	if c.Title == nil || *c.Title != "Sales" {
		t.Errorf("expected title \"Sales\", got %v", c.Title)
	}
	if c.Axes == nil || c.Axes.X == nil || *c.Axes.X != "Quarter" {
		t.Errorf("expected x axis \"Quarter\", got %v", c.Axes)
	}
	if c.Axes == nil || c.Axes.Y == nil || *c.Axes.Y != "Amount" {
		t.Errorf("expected y axis \"Amount\", got %v", c.Axes)
	}
	if !reflect.DeepEqual(c.Series, []string{"B1"}) {
		t.Errorf("expected series [B1], got %#v", c.Series)
	}
	if !reflect.DeepEqual(c.DataRanges, []string{"B2:B3"}) {
		t.Errorf("expected dataRanges [B2:B3], got %#v", c.DataRanges)
	}
}

func TestReadSheet_ChartTypeMapping(t *testing.T) {
	cases := []struct {
		ct   excelize.ChartType
		want sheetcompressor.ChartType
	}{
		{excelize.Bar, "bar"},
		{excelize.Line, "line"},
		{excelize.Pie, "pie"},
		{excelize.Scatter, "scatter"},
		{excelize.Area, "area"},
	}
	for _, tc := range cases {
		tc := tc
		t.Run(string(tc.want), func(t *testing.T) {
			data := writeWorkbook(t, func(f *excelize.File) {
				f.SetCellValue("Sheet1", "A1", "x")
				f.SetCellValue("Sheet1", "B1", 1)
				if err := f.AddChart("Sheet1", "B5", &excelize.Chart{
					Type: tc.ct,
					Series: []excelize.ChartSeries{
						{Name: "Sheet1!$A$1", Values: "Sheet1!$B$1:$B$1"},
					},
				}); err != nil {
					t.Fatalf("AddChart: %v", err)
				}
			})
			g := mustRead(t, data, Options{})
			if len(g.Charts) != 1 {
				t.Fatalf("expected 1 chart, got %d", len(g.Charts))
			}
			if g.Charts[0].Type != tc.want {
				t.Errorf("type mismatch: got %s want %s", g.Charts[0].Type, tc.want)
			}
		})
	}
}

func TestReadSheet_NoChartsReturnsEmpty(t *testing.T) {
	data := writeWorkbook(t, func(f *excelize.File) {
		f.SetCellValue("Sheet1", "A1", "x")
	})
	g := mustRead(t, data, Options{})
	if len(g.Charts) != 0 {
		t.Errorf("expected no charts, got %d", len(g.Charts))
	}
}

/* -------------------------------------------------------------------------- */
/* Error paths                                                                */
/* -------------------------------------------------------------------------- */

func TestReadSheet_RejectsGarbageBytes(t *testing.T) {
	if _, err := ReadSheet([]byte("not a workbook"), Options{}); err == nil {
		t.Fatal("expected error for garbage input")
	}
}

func TestReadSheet_ReadSheetFile_Missing(t *testing.T) {
	if _, err := ReadSheetFile("/tmp/does-not-exist.xlsx", Options{}); err == nil {
		t.Fatal("expected error for missing file")
	}
}

func TestReadSheet_ErrAdapterUnavailable_NotReturnedInRealBuild(t *testing.T) {
	// Sanity check: the real adapter must NEVER return ErrAdapterUnavailable.
	// (The stub does; pinning here makes the build-tag wiring explicit.)
	data := writeWorkbook(t, func(f *excelize.File) {
		f.SetCellValue("Sheet1", "A1", "x")
	})
	_, err := ReadSheet(data, Options{})
	if errors.Is(err, ErrAdapterUnavailable) {
		t.Fatal("real adapter returned ErrAdapterUnavailable")
	}
}
