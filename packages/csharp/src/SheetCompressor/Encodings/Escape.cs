using System.Text;

namespace SheetCompressor.Encodings;

internal static class Escape
{
    /// <summary>
    /// SPEC §3.2 rules 1–6: backslash first so later rules' backslashes aren't
    /// double-escaped, then the delimiters, then the whitespace controls.
    /// Shared by the anchor and inverted-index encodings (SPEC §4.4 reuses).
    /// </summary>
    public static string EscapeValue(string v)
    {
        if (v.Length == 0) return v;
        var sb = new StringBuilder(v.Length);
        foreach (var ch in v)
        {
            switch (ch)
            {
                case '\\': sb.Append("\\\\"); break;
                case ',': sb.Append("\\,"); break;
                case '|': sb.Append("\\|"); break;
                case '\n': sb.Append("\\n"); break;
                case '\r': sb.Append("\\r"); break;
                case '\t': sb.Append("\\t"); break;
                default: sb.Append(ch); break;
            }
        }
        return sb.ToString();
    }
}
