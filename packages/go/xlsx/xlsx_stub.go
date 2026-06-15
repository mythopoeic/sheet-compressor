//go:build !sheetcompressor_excelize

package xlsx

import "github.com/mythopoeic/sheet-compressor/packages/go/sheetcompressor"

func readSheetImpl(_ []byte, _ Options) (*sheetcompressor.Grid, error) {
	return nil, ErrAdapterUnavailable
}
