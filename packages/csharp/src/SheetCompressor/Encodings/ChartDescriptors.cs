using System.Collections.Generic;
using System.Text;

namespace SheetCompressor.Encodings;

internal static class ChartDescriptors
{
    private static string EscapeQuoted(string s)
    {
        if (s.Length == 0) return s;
        var sb = new StringBuilder(s.Length);
        foreach (var ch in s)
        {
            switch (ch)
            {
                case '\\': sb.Append("\\\\"); break;
                case '"': sb.Append("\\\""); break;
                case '\n': sb.Append("\\n"); break;
                case '\r': sb.Append("\\r"); break;
                case '\t': sb.Append("\\t"); break;
                default: sb.Append(ch); break;
            }
        }
        return sb.ToString();
    }

    private static string EscapeSeriesName(string s)
    {
        if (s.Length == 0) return s;
        var sb = new StringBuilder(s.Length);
        foreach (var ch in s)
        {
            switch (ch)
            {
                case '\\': sb.Append("\\\\"); break;
                case ',': sb.Append("\\,"); break;
                case ']': sb.Append("\\]"); break;
                case '\n': sb.Append("\\n"); break;
                case '\r': sb.Append("\\r"); break;
                case '\t': sb.Append("\\t"); break;
                default: sb.Append(ch); break;
            }
        }
        return sb.ToString();
    }

    internal static string ChartTypeName(ChartType t) => t switch
    {
        ChartType.Bar => "bar",
        ChartType.Line => "line",
        ChartType.Pie => "pie",
        ChartType.Scatter => "scatter",
        ChartType.Area => "area",
        ChartType.Other => "other",
        _ => "other",
    };

    public static string RenderChartToken(ChartDescriptor chart)
    {
        var parts = new List<string>
        {
            $"CHART({ChartTypeName(chart.Type)})@{chart.AnchorRange}"
        };
        if (chart.Title is not null)
        {
            parts.Add($"title=\"{EscapeQuoted(chart.Title)}\"");
        }
        if (chart.DataRanges is { Count: > 0 } dr)
        {
            parts.Add($"data={string.Join(",", dr)}");
        }
        if (chart.Series is { Count: > 0 } series)
        {
            var sb = new StringBuilder("series=[");
            for (int i = 0; i < series.Count; i++)
            {
                if (i > 0) sb.Append(',');
                sb.Append(EscapeSeriesName(series[i]));
            }
            sb.Append(']');
            parts.Add(sb.ToString());
        }
        if (chart.Axes?.X is not null)
        {
            parts.Add($"xAxis=\"{EscapeQuoted(chart.Axes.X)}\"");
        }
        if (chart.Axes?.Y is not null)
        {
            parts.Add($"yAxis=\"{EscapeQuoted(chart.Axes.Y)}\"");
        }
        return string.Join(" ", parts);
    }

    public static string RenderChartBlock(IReadOnlyList<ChartDescriptor>? charts)
    {
        if (charts is null || charts.Count == 0) return string.Empty;
        var sb = new StringBuilder();
        for (int i = 0; i < charts.Count; i++)
        {
            if (i > 0) sb.Append('\n');
            sb.Append(RenderChartToken(charts[i]));
        }
        return sb.ToString();
    }

    public static string AppendChartBlock(string cellString, string chartBlock)
    {
        if (chartBlock.Length == 0) return cellString;
        if (cellString.Length == 0) return chartBlock;
        return cellString + "\n" + chartBlock;
    }
}
