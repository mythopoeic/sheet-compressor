// Package tiktoken is the OPTIONAL real-tokenizer adapter for the Go port
// (PRD #1 acceptance criterion: tiktoken-go default with heuristic fallback).
//
// The core `sheetcompressor` package is dependency-free and uses the SPEC §7
// heuristic by default. Importing this sub-package opts into a tiktoken-go
// backed counter, declared via a build tag so the dependency is genuinely
// optional — `go build ./...` from a consumer that doesn't tag with
// `sheetcompressor_tiktoken` builds the stub form here and never pulls in
// tiktoken-go.
//
// Usage:
//
//	import "github.com/mythopoeic/sheet-compressor/packages/go/tiktoken"
//
//	counter, err := tiktoken.NewCounter(tiktoken.Options{Encoding: "o200k_base"})
//	if err != nil {
//	    // fall back to the heuristic
//	    counter = sheetcompressor.EstimateTokens
//	}
//	result := sheetcompressor.Compress(grid, sheetcompressor.Options{TokenCounter: counter})
package tiktoken

import "github.com/mythopoeic/sheet-compressor/packages/go/sheetcompressor"

// Options configure the tiktoken-go-backed counter.
type Options struct {
	// Encoding is the BPE encoding name; defaults to "o200k_base"
	// (GPT-4o / GPT-5 family) per the PRD.
	Encoding string
}

// NewCounter returns a sheetcompressor.TokenCounter backed by tiktoken-go
// when the package is built with `-tags sheetcompressor_tiktoken` (and
// tiktoken-go is on the module graph). Without the build tag the
// implementation returns an error so callers can fall back to the SPEC §7
// heuristic — see the package doc for the recommended pattern.
func NewCounter(opts Options) (sheetcompressor.TokenCounter, error) {
	return newCounter(opts)
}
