using System.Collections.Generic;
using System.Text;

namespace SheetCompressor.Encodings;

internal static class InvertedIndex
{
    /// <summary>
    /// Pack absolute (row, col) into a single long for HashSet/Dictionary keys.
    /// </summary>
    private static long Pack(int row, int col)
    {
        return ((long)row << 32) | (uint)col;
    }

    public static Encoding Encode(Grid grid, TokenCounter tokenCounter)
    {
        // Walk the grid in row-major order, bucketing every non-empty cell by
        // value. We use an ordered key list so iteration later yields values in
        // first-cell-address order (SPEC §4.4).
        var cellsByValue = new Dictionary<string, List<long>>();
        var valueOrder = new List<string>();

        for (int r = 0; r < grid.Rows.Count; r++)
        {
            var row = grid.Rows[r];
            for (int c = 0; c < row.Count; c++)
            {
                var value = row[c] ?? string.Empty;
                if (value.Length == 0) continue;
                var key = Pack(grid.Origin.Row + r, grid.Origin.Col + c);
                if (!cellsByValue.TryGetValue(value, out var bucket))
                {
                    bucket = new List<long>();
                    cellsByValue[value] = bucket;
                    valueOrder.Add(value);
                }
                bucket.Add(key);
            }
        }

        var groups = new List<InvertedIndexGroupJson>();

        foreach (var value in valueOrder)
        {
            var cellKeys = cellsByValue[value];
            var present = new HashSet<long>(cellKeys);
            var assigned = new HashSet<long>();
            var ranges = new List<string>();

            foreach (var startKey in cellKeys)
            {
                if (assigned.Contains(startKey)) continue;
                int startRow = (int)(startKey >> 32);
                int startCol = (int)(startKey & 0xFFFFFFFFu);

                // Maximum width: extend right while cells are in the value-set
                // AND not already absorbed by an earlier rectangle.
                int width = 1;
                while (true)
                {
                    var nk = Pack(startRow, startCol + width);
                    if (!present.Contains(nk) || assigned.Contains(nk)) break;
                    width++;
                }

                // Maximum height: extend down while every cell of the row of
                // `width` cells is still in the value-set and unassigned.
                int height = 1;
                while (true)
                {
                    int nextRow = startRow + height;
                    bool canExtend = true;
                    for (int dc = 0; dc < width; dc++)
                    {
                        var k = Pack(nextRow, startCol + dc);
                        if (!present.Contains(k) || assigned.Contains(k))
                        {
                            canExtend = false;
                            break;
                        }
                    }
                    if (!canExtend) break;
                    height++;
                }

                for (int dr = 0; dr < height; dr++)
                {
                    for (int dc = 0; dc < width; dc++)
                    {
                        assigned.Add(Pack(startRow + dr, startCol + dc));
                    }
                }

                var topLeft = Address.A1(startRow, startCol);
                if (width == 1 && height == 1)
                {
                    ranges.Add(topLeft);
                }
                else
                {
                    ranges.Add($"{topLeft}:{Address.A1(startRow + height - 1, startCol + width - 1)}");
                }
            }

            groups.Add(new InvertedIndexGroupJson { Value = value, Ranges = ranges });
        }

        var sb = new StringBuilder();
        for (int i = 0; i < groups.Count; i++)
        {
            if (i > 0) sb.Append('\n');
            var g = groups[i];
            for (int j = 0; j < g.Ranges.Count; j++)
            {
                if (j > 0) sb.Append('|');
                sb.Append(g.Ranges[j]);
            }
            sb.Append(',');
            sb.Append(Escape.EscapeValue(g.Value));
        }
        var s = sb.ToString();

        var json = new InvertedIndexJson
        {
            Origin = grid.Origin,
            Groups = groups,
        };
        return new Encoding { String = s, Json = json, TokenEstimate = tokenCounter(s) };
    }
}
