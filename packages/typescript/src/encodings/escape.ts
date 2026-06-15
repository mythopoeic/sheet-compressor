/**
 * Per SPEC §3.2 rules 1–6: backslash first (so later rules' backslashes aren't
 * double-escaped), then the delimiters, then the whitespace controls. Shared by
 * the anchor and inverted-index encodings (SPEC §4.4 reuses these rules).
 */
export function escapeValue(v: string): string {
  return v
    .replace(/\\/g, "\\\\")
    .replace(/,/g, "\\,")
    .replace(/\|/g, "\\|")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}
