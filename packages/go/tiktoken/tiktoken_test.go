//go:build !sheetcompressor_tiktoken

package tiktoken

import (
	"errors"
	"testing"
)

// The default-build adapter must surface a clear, actionable error so callers
// can fall back to the SPEC §7 heuristic. This pins the contract: no panic,
// no nil counter without an error.
func TestNewCounterReportsUnavailable(t *testing.T) {
	counter, err := NewCounter(Options{})
	if counter != nil {
		t.Fatalf("expected nil counter when tiktoken adapter is not built, got non-nil")
	}
	if !errors.Is(err, ErrTokenizerUnavailable) {
		t.Fatalf("expected ErrTokenizerUnavailable, got %v", err)
	}
}
