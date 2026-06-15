// Package xlsx is the OPTIONAL .xlsx adapter for the Go port (SPEC §8 / PRD
// Seam 2). It reads a single sheet — grid, origin, per-cell data type, and
// embedded chart descriptors — into the core's input contract
// (sheetcompressor.Grid). The pure compression core stays dependency-free; this
// sub-package is the only place excelize is referenced.
//
// Like the tiktoken adapter, this package is gated behind a build tag so the
// dependency is genuinely optional. Without `-tags sheetcompressor_excelize`
// the package compiles to a stub whose ReadSheet returns ErrAdapterUnavailable,
// pointing callers at building a Grid themselves (SPEC §8.2's "clear,
// actionable error that names the missing dependency").
//
// Usage:
//
//	import "github.com/mythopoeic/sheet-compressor/packages/go/xlsx"
//
//	grid, err := xlsx.ReadSheetFile("workbook.xlsx", xlsx.Options{})
//	if err != nil {
//	    if errors.Is(err, xlsx.ErrAdapterUnavailable) {
//	        // build the grid yourself and call sheetcompressor.Compress
//	        return
//	    }
//	    return err
//	}
//	result := sheetcompressor.Compress(grid, sheetcompressor.Options{})
//
// To enable the real adapter:
//
//	go get github.com/xuri/excelize/v2
//	go build -tags sheetcompressor_excelize ./...
package xlsx

import (
	"errors"
	"os"

	"github.com/mythopoeic/sheet-compressor/packages/go/sheetcompressor"
)

// ErrAdapterUnavailable is returned by ReadSheet / ReadSheetFile when the
// package is built without the `sheetcompressor_excelize` build tag. Callers
// can `errors.Is(err, xlsx.ErrAdapterUnavailable)` to fall back gracefully.
var ErrAdapterUnavailable = errors.New(
	"xlsx adapter not built: rebuild with `-tags sheetcompressor_excelize` " +
		"and ensure github.com/xuri/excelize/v2 is on the module graph, or " +
		"construct sheetcompressor.Grid yourself and pass it to Compress",
)

// Options control how a workbook is read into a Grid.
type Options struct {
	// SheetName selects a sheet by name. Wins over SheetIndex when set.
	SheetName string
	// SheetIndex selects a sheet by 0-indexed position. Defaults to 0.
	SheetIndex int
}

// ReadSheet parses the workbook bytes and returns the SPEC §1 Grid for one
// sheet. Without the `sheetcompressor_excelize` build tag, returns
// ErrAdapterUnavailable.
func ReadSheet(data []byte, opts Options) (*sheetcompressor.Grid, error) {
	return readSheetImpl(data, opts)
}

// ReadSheetFile is a convenience wrapper that reads the file from disk and
// dispatches to ReadSheet.
func ReadSheetFile(path string, opts Options) (*sheetcompressor.Grid, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	return ReadSheet(data, opts)
}
