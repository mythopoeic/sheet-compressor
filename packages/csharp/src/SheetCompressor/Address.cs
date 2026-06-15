using System;
using System.Text;

namespace SheetCompressor;

public static class Address
{
    /// <summary>
    /// 1-indexed column number → Excel column letters.
    ///   1 → "A", 26 → "Z", 27 → "AA", 52 → "AZ", 702 → "ZZ", 703 → "AAA".
    /// </summary>
    public static string ColToLetters(int col)
    {
        if (col < 1)
        {
            throw new ArgumentOutOfRangeException(
                nameof(col),
                col,
                $"column must be a positive integer, got {col}");
        }
        int n = col;
        StringBuilder sb = new();
        while (n > 0)
        {
            int rem = (n - 1) % 26;
            sb.Insert(0, (char)('A' + rem));
            n = (n - 1) / 26;
        }
        return sb.ToString();
    }

    /// <summary>Format an A1 address from 1-indexed (row, col).</summary>
    public static string A1(int row, int col)
    {
        return ColToLetters(col) + row.ToString(System.Globalization.CultureInfo.InvariantCulture);
    }
}
