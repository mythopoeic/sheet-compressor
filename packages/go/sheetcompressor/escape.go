package sheetcompressor

import "strings"

// escapeValue applies SPEC §3.2 rules 1–6 in order: backslash first (so later
// rules' backslashes aren't double-escaped), then the delimiters, then the
// whitespace controls. Shared by the anchor and inverted-index encodings.
func escapeValue(v string) string {
	r := strings.NewReplacer(
		`\`, `\\`,
		`,`, `\,`,
		`|`, `\|`,
		"\n", `\n`,
		"\r", `\r`,
		"\t", `\t`,
	)
	return r.Replace(v)
}

// escapeQuoted is SPEC §6.1's escape for double-quoted token fields
// (title, xAxis, yAxis). Backslash first, then the quote, then the whitespace
// controls.
func escapeQuoted(s string) string {
	r := strings.NewReplacer(
		`\`, `\\`,
		`"`, `\"`,
		"\n", `\n`,
		"\r", `\r`,
		"\t", `\t`,
	)
	return r.Replace(s)
}

// escapeSeriesName is SPEC §6.1's escape for a name inside series=[…].
// Backslash first, then the bracket-list delimiters, then the whitespace
// controls.
func escapeSeriesName(s string) string {
	r := strings.NewReplacer(
		`\`, `\\`,
		`,`, `\,`,
		`]`, `\]`,
		"\n", `\n`,
		"\r", `\r`,
		"\t", `\t`,
	)
	return r.Replace(s)
}
