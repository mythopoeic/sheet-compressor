using System.Collections.Generic;
using System.Text.RegularExpressions;

namespace SheetCompressor;

public static class Strategies
{
    private const int Phase1K = 4;
    private const double Phase1HetThreshold = 0.5;

    public static readonly IAnchorStrategy KeepAll = new KeepAllStrategy();
    public static readonly IAnchorStrategy Phase1 = new Phase1Strategy();

    public static IAnchorStrategy Resolve(object? selector)
    {
        if (selector is null) return Phase1;
        if (selector is IAnchorStrategy s) return s;
        if (selector is string name)
        {
            return name switch
            {
                "keep-all" => KeepAll,
                "phase1" => Phase1,
                _ => Phase1,
            };
        }
        return Phase1;
    }

    private static (int RowCount, int ColCount) GridDimensions(Grid grid)
    {
        int rowCount = grid.Rows.Count;
        int colCount = 0;
        foreach (var row in grid.Rows)
        {
            if (row.Count > colCount) colCount = row.Count;
        }
        return (rowCount, colCount);
    }

    private sealed class KeepAllStrategy : IAnchorStrategy
    {
        public string Name => "keep-all";

        public AnchorDetection Detect(Grid grid)
        {
            var (rowCount, colCount) = GridDimensions(grid);
            var keptRows = new HashSet<int>();
            for (int r = 0; r < rowCount; r++) keptRows.Add(r);
            var keptCols = new HashSet<int>();
            for (int c = 0; c < colCount; c++) keptCols.Add(c);
            return new AnchorDetection { KeptRows = keptRows, KeptCols = keptCols };
        }
    }

    private static readonly Regex NumericRe = new(@"^-?\d+(\.\d+)?$", RegexOptions.Compiled);

    private static DataType InferType(string value)
    {
        if (value.Length == 0) return DataType.Empty;
        if (NumericRe.IsMatch(value)) return DataType.Number;
        return DataType.Text;
    }

    private sealed class Phase1Strategy : IAnchorStrategy
    {
        public string Name => "phase1";

        public AnchorDetection Detect(Grid grid)
        {
            var (rowCount, colCount) = GridDimensions(grid);
            if (rowCount == 0 || colCount == 0)
            {
                return new AnchorDetection
                {
                    KeptRows = new HashSet<int>(),
                    KeptCols = new HashSet<int>(),
                };
            }

            string CellAt(int r, int c)
            {
                var row = grid.Rows[r];
                if (c >= row.Count) return string.Empty;
                return row[c] ?? string.Empty;
            }

            DataType TypeAt(int r, int c)
            {
                var meta = grid.CellMeta;
                if (meta is not null && r < meta.Count)
                {
                    var metaRow = meta[r];
                    if (metaRow is not null && c < metaRow.Count)
                    {
                        var cellMeta = metaRow[c];
                        if (cellMeta?.DataType is { } dt) return dt;
                    }
                }
                return InferType(CellAt(r, c));
            }

            var anchorRows = new HashSet<int>();
            for (int r = 0; r < rowCount; r++)
            {
                var values = new List<string>(colCount);
                for (int c = 0; c < colCount; c++) values.Add(CellAt(r, c));
                if (Heterogeneity(values) >= Phase1HetThreshold) anchorRows.Add(r);
            }
            for (int r = 1; r < rowCount; r++)
            {
                if (RowTypesDiffer(TypeAt, r - 1, r, colCount))
                {
                    anchorRows.Add(r - 1);
                    anchorRows.Add(r);
                }
            }

            var anchorCols = new HashSet<int>();
            for (int c = 0; c < colCount; c++)
            {
                var values = new List<string>(rowCount);
                for (int r = 0; r < rowCount; r++) values.Add(CellAt(r, c));
                if (Heterogeneity(values) >= Phase1HetThreshold) anchorCols.Add(c);
            }
            for (int c = 1; c < colCount; c++)
            {
                if (ColTypesDiffer(TypeAt, c - 1, c, rowCount))
                {
                    anchorCols.Add(c - 1);
                    anchorCols.Add(c);
                }
            }

            var keptRows = ExpandNeighborhood(anchorRows, rowCount, Phase1K);
            var keptCols = ExpandNeighborhood(anchorCols, colCount, Phase1K);

            // Prune entirely-blank rows/cols within the kept region. Rows first,
            // then columns — same single-pass order as the reference.
            foreach (var r in new List<int>(keptRows))
            {
                bool hasContent = false;
                foreach (var c in keptCols)
                {
                    if (CellAt(r, c).Length != 0)
                    {
                        hasContent = true;
                        break;
                    }
                }
                if (!hasContent) keptRows.Remove(r);
            }
            foreach (var c in new List<int>(keptCols))
            {
                bool hasContent = false;
                foreach (var r in keptRows)
                {
                    if (CellAt(r, c).Length != 0)
                    {
                        hasContent = true;
                        break;
                    }
                }
                if (!hasContent) keptCols.Remove(c);
            }

            return new AnchorDetection { KeptRows = keptRows, KeptCols = keptCols };
        }
    }

    private static double Heterogeneity(List<string> values)
    {
        int nonEmpty = 0;
        var seen = new HashSet<string>();
        foreach (var v in values)
        {
            if (v.Length == 0) continue;
            nonEmpty++;
            seen.Add(v);
        }
        if (nonEmpty == 0) return 0;
        return (double)seen.Count / nonEmpty;
    }

    private static bool RowTypesDiffer(
        System.Func<int, int, DataType> typeAt,
        int rA,
        int rB,
        int colCount)
    {
        for (int c = 0; c < colCount; c++)
        {
            if (typeAt(rA, c) != typeAt(rB, c)) return true;
        }
        return false;
    }

    private static bool ColTypesDiffer(
        System.Func<int, int, DataType> typeAt,
        int cA,
        int cB,
        int rowCount)
    {
        for (int r = 0; r < rowCount; r++)
        {
            if (typeAt(r, cA) != typeAt(r, cB)) return true;
        }
        return false;
    }

    private static HashSet<int> ExpandNeighborhood(HashSet<int> anchors, int size, int k)
    {
        var kept = new HashSet<int>();
        foreach (var a in anchors)
        {
            int lo = a - k < 0 ? 0 : a - k;
            int hi = a + k > size - 1 ? size - 1 : a + k;
            for (int i = lo; i <= hi; i++) kept.Add(i);
        }
        return kept;
    }
}
