//go:build sheetcompressor_tiktoken

package tiktoken

import (
	"fmt"

	"github.com/mythopoeic/sheet-compressor/packages/go/sheetcompressor"
	"github.com/pkoukk/tiktoken-go"
)

func newCounter(opts Options) (sheetcompressor.TokenCounter, error) {
	encoding := opts.Encoding
	if encoding == "" {
		encoding = "o200k_base"
	}
	enc, err := tiktoken.GetEncoding(encoding)
	if err != nil {
		return nil, fmt.Errorf("load tiktoken encoding %q: %w", encoding, err)
	}
	return func(s string) int {
		return len(enc.Encode(s, nil, nil))
	}, nil
}
