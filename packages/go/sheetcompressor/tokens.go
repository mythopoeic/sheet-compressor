package sheetcompressor

import "unicode/utf16"

// EstimateTokens is the v0 heuristic counter (SPEC §7): ceil(utf-16-units / 4),
// with "" → 0. Go strings are UTF-8 byte slices, so we count UTF-16 code
// units the same way every other port does — a BMP rune is 1 unit, a
// non-BMP rune (e.g. an emoji) is 2.
func EstimateTokens(s string) int {
	if s == "" {
		return 0
	}
	units := 0
	for _, r := range s {
		if utf16.IsSurrogate(r) {
			// Lone surrogates can't appear in a valid Go string, but if one
			// does it still encodes to a single UTF-16 unit.
			units++
			continue
		}
		if r > 0xFFFF {
			units += 2
		} else {
			units++
		}
	}
	// ceil(units / 4)
	return (units + 3) / 4
}
