package sheetcompressor

import (
	"fmt"
	"strings"
)

// colToLetters converts a 1-indexed column number to its Excel letter form:
// 1 → "A", 26 → "Z", 27 → "AA", 702 → "ZZ", 703 → "AAA". Panics on inputs
// less than 1 since v0 always builds addresses from internally-derived
// (origin + offset) integers.
func colToLetters(col int) string {
	if col < 1 {
		panic(fmt.Sprintf("column must be a positive integer, got %d", col))
	}
	var sb strings.Builder
	n := col
	out := make([]byte, 0, 4)
	for n > 0 {
		rem := (n - 1) % 26
		out = append(out, byte('A'+rem))
		n = (n - 1) / 26
	}
	// out was built lowest digit first; reverse it.
	for i := len(out) - 1; i >= 0; i-- {
		sb.WriteByte(out[i])
	}
	return sb.String()
}

// a1 builds an A1 address from a 1-indexed (row, col) pair.
func a1(row, col int) string {
	return fmt.Sprintf("%s%d", colToLetters(col), row)
}
