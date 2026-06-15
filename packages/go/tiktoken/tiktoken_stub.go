//go:build !sheetcompressor_tiktoken

package tiktoken

import (
	"errors"

	"github.com/mythopoeic/sheet-compressor/packages/go/sheetcompressor"
)

// ErrTokenizerUnavailable is returned by NewCounter when the package is built
// without the `sheetcompressor_tiktoken` build tag. The Go port keeps tiktoken
// truly optional: zero third-party dependencies in the default build, matching
// the SPEC §7 contract that "the core MUST work without it".
var ErrTokenizerUnavailable = errors.New(
	"tiktoken adapter not built: rebuild with `-tags sheetcompressor_tiktoken` " +
		"and ensure github.com/pkoukk/tiktoken-go is on the module graph, or fall " +
		"back to sheetcompressor.EstimateTokens",
)

func newCounter(_ Options) (sheetcompressor.TokenCounter, error) {
	return nil, ErrTokenizerUnavailable
}
