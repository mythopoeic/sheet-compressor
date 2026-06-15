package sheetcompressor

import "testing"

// SPEC §7: the v0 heuristic counts UTF-16 code units, ceil ÷ 4.
// Emojis outside the BMP are TWO units (surrogate pair). A code-point port
// (Python `len`) or UTF-8-byte port (Go `len`) gets these wrong without the
// conversion — pin the worked example from SPEC §7 here so a regression
// flips immediately, not just on the unicode corpus fixture.
func TestEstimateTokensUTF16(t *testing.T) {
	cases := []struct {
		in   string
		want int
	}{
		{"", 0},
		{"abcd", 1},
		{"abcde", 2},
		{"😀", 1},     // 2 units → ceil(2/4) = 1
		{"😀😀", 1},   // 4 units → ceil(4/4) = 1
		{"😀😀😀", 2}, // 6 units → ceil(6/4) = 2
		{"日本語", 1},  // 3 BMP chars → ceil(3/4) = 1
		{"café", 1},  // 4 BMP chars → ceil(4/4) = 1
		{"𝐀bold", 2}, // 2 units (math A) + 4 ASCII = 6 → ceil(6/4) = 2
	}
	for _, c := range cases {
		if got := EstimateTokens(c.in); got != c.want {
			t.Errorf("EstimateTokens(%q) = %d, want %d", c.in, got, c.want)
		}
	}
}
