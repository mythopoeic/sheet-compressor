using System.Collections.Generic;
using System.Text;

namespace SheetCompressor.Encodings;

internal static class Anchor
{
    public static Encoding Encode(Grid grid, AnchorDetection detection, TokenCounter tokenCounter)
    {
        var cells = new List<AnchorCellJson>();
        var lines = new List<string>();
        var sb = new StringBuilder();

        for (int r = 0; r < grid.Rows.Count; r++)
        {
            if (!detection.KeptRows.Contains(r)) continue;
            var row = grid.Rows[r];
            sb.Clear();
            int tokenCount = 0;
            for (int c = 0; c < row.Count; c++)
            {
                if (!detection.KeptCols.Contains(c)) continue;
                var value = row[c] ?? string.Empty;
                if (value.Length == 0) continue;
                var address = Address.A1(grid.Origin.Row + r, grid.Origin.Col + c);
                cells.Add(new AnchorCellJson { Address = address, Value = value });
                if (tokenCount > 0) sb.Append('|');
                sb.Append(address);
                sb.Append(',');
                sb.Append(Escape.EscapeValue(value));
                tokenCount++;
            }
            if (tokenCount > 0) lines.Add(sb.ToString());
        }

        var s = string.Join("\n", lines);
        var json = new AnchorJson
        {
            Origin = grid.Origin,
            Cells = cells,
        };
        return new Encoding { String = s, Json = json, TokenEstimate = tokenCounter(s) };
    }
}
