package sheetcompressor

import (
	"bytes"
	"encoding/json"
)

// MarshalGoldenJSON renders a value the way the corpus goldens are formatted:
// 2-space indent, trailing "\n", and UTF-8 literal output (no HTML escaping
// of `<`, `>`, `&`; no \uXXXX escaping of non-ASCII). This is the canonical
// JSON form for every encoding's `.json` and for `charts.json` per SPEC §3.3.
func MarshalGoldenJSON(v any) ([]byte, error) {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", "  ")
	if err := enc.Encode(v); err != nil {
		return nil, err
	}
	// json.Encoder.Encode appends a single "\n" — exactly what the goldens
	// have, so we return the buffer verbatim.
	return buf.Bytes(), nil
}
