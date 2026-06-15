using System;
using System.Collections.Generic;
using System.Text;
using System.Text.RegularExpressions;

namespace SheetCompressor.Encodings;

internal static class FormatAggregation
{
    /// <summary>
    /// Canonical emission order for format-aggregation groups (SPEC §5.1).
    /// Every port MUST emit groups in this order, independent of which row/col
    /// surfaced them.
    /// </summary>
    private static readonly FormatType[] TypeOrder = new[]
    {
        FormatType.IntNum,
        FormatType.FloatNum,
        FormatType.ScientificNum,
        FormatType.PercentageNum,
        FormatType.CurrencyData,
        FormatType.DateData,
        FormatType.TimeData,
        FormatType.YearData,
        FormatType.EmailData,
        FormatType.Boolean,
        FormatType.Text,
    };

    // Classification patterns, applied in priority order — first match wins.
    private static readonly Regex Boolean = new(@"^(?:true|false)$", RegexOptions.Compiled | RegexOptions.IgnoreCase);
    private static readonly Regex Email = new(@"^[^\s@]+@[^\s@]+\.[^\s@]+$", RegexOptions.Compiled);
    private static readonly Regex Scientific = new(@"^-?\d+(?:\.\d+)?[eE][+-]?\d+$", RegexOptions.Compiled);
    private static readonly Regex Percent = new(@"^-?\d+(?:\.\d+)?%$", RegexOptions.Compiled);
    private static readonly Regex Currency = new(@"^-?[$€£¥]\d+(?:\.\d+)?$", RegexOptions.Compiled);
    private static readonly Regex DateIso = new(@"^\d{4}-\d{1,2}-\d{1,2}$", RegexOptions.Compiled);
    private static readonly Regex DateSlash = new(@"^\d{1,2}/\d{1,2}/\d{2,4}$", RegexOptions.Compiled);
    private static readonly Regex DateDash = new(@"^\d{1,2}-\d{1,2}-\d{2,4}$", RegexOptions.Compiled);
    private static readonly Regex Time12 = new(@"^\d{1,2}:\d{2}(?::\d{2})?\s?(?:AM|PM|am|pm)$", RegexOptions.Compiled);
    private static readonly Regex Time24 = new(@"^\d{1,2}:\d{2}(?::\d{2})?$", RegexOptions.Compiled);
    private static readonly Regex Year = new(@"^(?:19|20)\d{2}$", RegexOptions.Compiled);
    private static readonly Regex Float = new(@"^-?(?:\d+\.\d*|\.\d+)$", RegexOptions.Compiled);
    private static readonly Regex Int = new(@"^-?\d+$", RegexOptions.Compiled);

    /// <summary>
    /// Header labels that mark a column as holding years. Used by the
    /// context-aware year resolver (SPEC §5.1.1).
    /// </summary>
    private static readonly Regex YearHeader = new(
        @"\b(?:years?|yr|yyyy|fy|fiscal\s*years?)\b",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    public static FormatType? Classify(string v)
    {
        if (v.Length == 0) return null;
        if (Boolean.IsMatch(v)) return FormatType.Boolean;
        if (Email.IsMatch(v)) return FormatType.EmailData;
        if (Scientific.IsMatch(v)) return FormatType.ScientificNum;
        if (Percent.IsMatch(v)) return FormatType.PercentageNum;
        if (Currency.IsMatch(v)) return FormatType.CurrencyData;
        if (DateIso.IsMatch(v) || DateSlash.IsMatch(v) || DateDash.IsMatch(v)) return FormatType.DateData;
        if (Time12.IsMatch(v) || Time24.IsMatch(v)) return FormatType.TimeData;
        if (Year.IsMatch(v)) return FormatType.YearData;
        if (Float.IsMatch(v)) return FormatType.FloatNum;
        if (Int.IsMatch(v)) return FormatType.IntNum;
        return FormatType.Text;
    }

    private static string CellAt(Grid grid, int r, int c)
    {
        if (r < 0 || r >= grid.Rows.Count) return string.Empty;
        var row = grid.Rows[r];
        if (c < 0 || c >= row.Count) return string.Empty;
        return row[c] ?? string.Empty;
    }

    private static string? NearestHeaderAbove(Grid grid, int r, int c)
    {
        for (int rr = r - 1; rr >= 0; rr--)
        {
            var v = CellAt(grid, rr, c);
            if (v.Length == 0) continue;
            if (Classify(v) == FormatType.Text) return v;
        }
        return null;
    }

    private static FormatType ResolveYear(Grid grid, int r, int c)
    {
        var header = NearestHeaderAbove(grid, r, c);
        if (header is not null)
        {
            return YearHeader.IsMatch(header) ? FormatType.YearData : FormatType.IntNum;
        }

        int intSiblings = 0;
        int yearSiblings = 0;
        int numRows = grid.Rows.Count;
        for (int rr = 0; rr < numRows; rr++)
        {
            if (rr == r) continue;
            var t = Classify(CellAt(grid, rr, c));
            if (t == FormatType.YearData)
            {
                intSiblings++;
                yearSiblings++;
            }
            else if (t == FormatType.IntNum)
            {
                intSiblings++;
            }
        }
        if (intSiblings == 0) return FormatType.IntNum;
        return yearSiblings == intSiblings ? FormatType.YearData : FormatType.IntNum;
    }

    private readonly record struct Rect(FormatType Type, int TopRow, int LeftCol, int BottomRow, int RightCol);

    private static List<Rect> Aggregate(Grid grid)
    {
        int numRows = grid.Rows.Count;
        int numCols = 0;
        foreach (var row in grid.Rows)
        {
            if (row.Count > numCols) numCols = row.Count;
        }
        if (numRows == 0 || numCols == 0) return new List<Rect>();

        var types = new FormatType?[numRows, numCols];
        for (int r = 0; r < numRows; r++)
        {
            var row = grid.Rows[r];
            for (int c = 0; c < numCols; c++)
            {
                var v = c < row.Count ? row[c] ?? string.Empty : string.Empty;
                types[r, c] = Classify(v);
            }
        }

        // Context-aware year resolution (SPEC §5.1.1).
        for (int r = 0; r < numRows; r++)
        {
            for (int c = 0; c < numCols; c++)
            {
                if (types[r, c] == FormatType.YearData) types[r, c] = ResolveYear(grid, r, c);
            }
        }

        var claimed = new bool[numRows, numCols];
        var rects = new List<Rect>();

        for (int r = 0; r < numRows; r++)
        {
            for (int c = 0; c < numCols; c++)
            {
                if (claimed[r, c]) continue;
                var t = types[r, c];
                if (t is null) continue;

                int w = 1;
                while (c + w < numCols && types[r, c + w] == t && !claimed[r, c + w])
                {
                    w++;
                }

                int h = 1;
                bool extending = true;
                while (extending && r + h < numRows)
                {
                    for (int cc = c; cc < c + w; cc++)
                    {
                        if (types[r + h, cc] != t || claimed[r + h, cc])
                        {
                            extending = false;
                            break;
                        }
                    }
                    if (extending) h++;
                }

                for (int rr = r; rr < r + h; rr++)
                {
                    for (int cc = c; cc < c + w; cc++)
                    {
                        claimed[rr, cc] = true;
                    }
                }

                rects.Add(new Rect(t.Value, r, c, r + h - 1, c + w - 1));
            }
        }

        return rects;
    }

    private static string RectToRange(Rect rect, Origin origin)
    {
        var topLeft = Address.A1(origin.Row + rect.TopRow, origin.Col + rect.LeftCol);
        if (rect.TopRow == rect.BottomRow && rect.LeftCol == rect.RightCol) return topLeft;
        var bottomRight = Address.A1(origin.Row + rect.BottomRow, origin.Col + rect.RightCol);
        return $"{topLeft}:{bottomRight}";
    }

    public static Encoding Encode(Grid grid, TokenCounter tokenCounter)
    {
        var rects = Aggregate(grid);

        var byType = new Dictionary<FormatType, List<string>>();
        foreach (var rect in rects)
        {
            if (!byType.TryGetValue(rect.Type, out var ranges))
            {
                ranges = new List<string>();
                byType[rect.Type] = ranges;
            }
            ranges.Add(RectToRange(rect, grid.Origin));
        }

        var groups = new List<FormatAggregationGroupJson>();
        foreach (var t in TypeOrder)
        {
            if (!byType.TryGetValue(t, out var ranges)) continue;
            if (ranges.Count == 0) continue;
            groups.Add(new FormatAggregationGroupJson { Type = t, Ranges = ranges });
        }

        var sb = new StringBuilder();
        for (int i = 0; i < groups.Count; i++)
        {
            if (i > 0) sb.Append('\n');
            var g = groups[i];
            sb.Append(FormatTypeName(g.Type));
            sb.Append(": ");
            for (int j = 0; j < g.Ranges.Count; j++)
            {
                if (j > 0) sb.Append(',');
                sb.Append(g.Ranges[j]);
            }
        }
        var s = sb.ToString();

        var json = new FormatAggregationJson
        {
            Origin = grid.Origin,
            Groups = groups,
        };
        return new Encoding { String = s, Json = json, TokenEstimate = tokenCounter(s) };
    }

    internal static string FormatTypeName(FormatType t) => t switch
    {
        FormatType.IntNum => "IntNum",
        FormatType.FloatNum => "FloatNum",
        FormatType.ScientificNum => "ScientificNum",
        FormatType.PercentageNum => "PercentageNum",
        FormatType.CurrencyData => "CurrencyData",
        FormatType.DateData => "DateData",
        FormatType.TimeData => "TimeData",
        FormatType.YearData => "YearData",
        FormatType.EmailData => "EmailData",
        FormatType.Boolean => "Boolean",
        FormatType.Text => "Text",
        _ => throw new ArgumentOutOfRangeException(nameof(t)),
    };
}
