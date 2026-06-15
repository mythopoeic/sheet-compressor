using System;

namespace SheetCompressor;

public static class Tokens
{
    /// <summary>
    /// v0 heuristic token counter (SPEC §7): ceil(utf16-code-units / 4), with "" → 0.
    /// .NET strings are UTF-16 already, so <c>s.Length</c> is the code-unit count.
    /// </summary>
    public static int EstimateTokens(string s)
    {
        if (s.Length == 0) return 0;
        return (s.Length + 3) / 4;
    }
}
