//go:build !sheetcompressor_excelize

package xlsx

import (
	"errors"
	"testing"
)

// Without the `sheetcompressor_excelize` build tag, ReadSheet must surface
// ErrAdapterUnavailable so callers can fall back to building a Grid by hand.
// SPEC §8.2 requires a clear, actionable error that names the missing
// dependency — see ErrAdapterUnavailable's message.
func TestReadSheet_StubReturnsErrAdapterUnavailable(t *testing.T) {
	_, err := ReadSheet([]byte("ignored"), Options{})
	if !errors.Is(err, ErrAdapterUnavailable) {
		t.Fatalf("expected ErrAdapterUnavailable, got %v", err)
	}
}

func TestReadSheetFile_StubReturnsErrAdapterUnavailable(t *testing.T) {
	// Read the source go.mod (any extant file works) so we exercise the path
	// where the file IS readable and the adapter still refuses.
	_, err := ReadSheetFile("../go.mod", Options{})
	if !errors.Is(err, ErrAdapterUnavailable) {
		t.Fatalf("expected ErrAdapterUnavailable, got %v", err)
	}
}
