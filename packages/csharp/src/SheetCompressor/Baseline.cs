using System.Collections.Generic;
using System.Linq;

namespace SheetCompressor;

public static class Baseline
{
    /// <summary>
    /// SPEC §7: vanilla un-compressed representation. Rows joined with " | ",
    /// separated by "\n", no escaping, no address prefixes. Whatever a caller
    /// would otherwise paste into a prompt before applying SheetCompressor.
    /// </summary>
    public static string VanillaEncode(Grid grid)
    {
        return string.Join("\n", grid.Rows.Select(row => string.Join(" | ", row)));
    }
}
