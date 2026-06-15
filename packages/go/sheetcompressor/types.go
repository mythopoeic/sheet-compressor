// Package sheetcompressor is the Go port of the sheet-compressor compression
// core. See ../../../spec/SPEC.md for the language-neutral contract.
package sheetcompressor

// Origin is the 1-indexed A1 address of grid.Rows[0][0] in the source sheet.
type Origin struct {
	Row int `json:"row"`
	Col int `json:"col"`
}

// DataType is SPEC §1's optional per-cell type. v0 only reads it for phase1
// anchor detection; style flags are reserved for phase 2.
type DataType string

const (
	DataTypeText    DataType = "text"
	DataTypeNumber  DataType = "number"
	DataTypeDate    DataType = "date"
	DataTypeBool    DataType = "bool"
	DataTypeFormula DataType = "formula"
	DataTypeError   DataType = "error"
	DataTypeEmpty   DataType = "empty"
)

// CellMeta carries optional per-cell metadata. v0 only consumes DataType.
type CellMeta struct {
	DataType DataType `json:"dataType,omitempty"`
}

// ChartType is SPEC §1's chart-type enum.
type ChartType string

// Axes carries the optional x/y axis labels of a chart.
type Axes struct {
	X *string `json:"x,omitempty"`
	Y *string `json:"y,omitempty"`
}

// ChartDescriptor is SPEC §1: a portable in-memory chart reference.
//
// Field order on this struct matches the canonical JSON key order from
// SPEC §1: name, type, anchorRange, title, dataRanges, series, axes. Go's
// encoding/json honors declaration order so the goldens lock this in.
type ChartDescriptor struct {
	Name        string    `json:"name"`
	Type        ChartType `json:"type"`
	AnchorRange string    `json:"anchorRange"`
	Title       *string   `json:"title,omitempty"`
	DataRanges  []string  `json:"dataRanges,omitempty"`
	Series      []string  `json:"series,omitempty"`
	Axes        *Axes     `json:"axes,omitempty"`
}

// Grid is SPEC §1's input contract.
type Grid struct {
	Rows     [][]string         `json:"rows"`
	Origin   Origin             `json:"origin"`
	CellMeta [][]CellMeta       `json:"cellMeta,omitempty"`
	Charts   []ChartDescriptor  `json:"charts,omitempty"`
}

// AnchorDetection is what a strategy returns: 0-indexed row/col sets to keep.
type AnchorDetection struct {
	KeptRows map[int]struct{}
	KeptCols map[int]struct{}
}

// AnchorStrategy is SPEC §3.1's swappable detector interface.
type AnchorStrategy interface {
	Name() string
	Detect(grid *Grid) AnchorDetection
}

// FormatType is SPEC §5.1's category enum.
type FormatType string

const (
	FormatTypeIntNum         FormatType = "IntNum"
	FormatTypeFloatNum       FormatType = "FloatNum"
	FormatTypeScientificNum  FormatType = "ScientificNum"
	FormatTypePercentageNum  FormatType = "PercentageNum"
	FormatTypeCurrencyData   FormatType = "CurrencyData"
	FormatTypeDateData       FormatType = "DateData"
	FormatTypeTimeData       FormatType = "TimeData"
	FormatTypeYearData       FormatType = "YearData"
	FormatTypeEmailData      FormatType = "EmailData"
	FormatTypeBoolean        FormatType = "Boolean"
	FormatTypeText           FormatType = "Text"
)

// AnchorCell is one row in AnchorJSON.Cells.
type AnchorCell struct {
	Address string `json:"address"`
	Value   string `json:"value"`
}

// AnchorJSON is SPEC §3.3's JSON form.
type AnchorJSON struct {
	Encoding string       `json:"encoding"`
	Version  int          `json:"version"`
	Origin   Origin       `json:"origin"`
	Cells    []AnchorCell `json:"cells"`
}

// InvertedIndexGroup is one row in InvertedIndexJSON.Groups.
type InvertedIndexGroup struct {
	Value  string   `json:"value"`
	Ranges []string `json:"ranges"`
}

// InvertedIndexJSON is SPEC §4.5's JSON form.
type InvertedIndexJSON struct {
	Encoding string               `json:"encoding"`
	Version  int                  `json:"version"`
	Origin   Origin               `json:"origin"`
	Groups   []InvertedIndexGroup `json:"groups"`
}

// FormatAggregationGroup is one row in FormatAggregationJSON.Groups.
type FormatAggregationGroup struct {
	Type   FormatType `json:"type"`
	Ranges []string   `json:"ranges"`
}

// FormatAggregationJSON is SPEC §5.4's JSON form.
type FormatAggregationJSON struct {
	Encoding string                   `json:"encoding"`
	Version  int                      `json:"version"`
	Origin   Origin                   `json:"origin"`
	Groups   []FormatAggregationGroup `json:"groups"`
}

// Encoding is one of the three SPEC §2 encodings — string, JSON, and the
// token estimate over `.String`.
type Encoding[T any] struct {
	String        string
	JSON          T
	TokenEstimate int
}

// CompressResult is SPEC §2's top-level result.
type CompressResult struct {
	Anchor            Encoding[AnchorJSON]
	InvertedIndex     Encoding[InvertedIndexJSON]
	FormatAggregation Encoding[FormatAggregationJSON]
	Charts            []ChartDescriptor
	RawBaseline       struct {
		TokenEstimate int
	}
}

// TokenCounter is SPEC §7's injectable counter.
type TokenCounter func(s string) int

// Options are caller-controlled inputs to Compress.
type Options struct {
	// AnchorStrategy is the SPEC §3.1 detector. nil → phase1 default.
	AnchorStrategy AnchorStrategy
	// TokenCounter counts tokens for the raw baseline and every encoding's
	// `.String`. nil → SPEC §7 heuristic.
	TokenCounter TokenCounter
}
