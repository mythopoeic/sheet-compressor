using System.Collections.Generic;
using System.Globalization;
using System.Text;
using SheetCompressor.Encodings;

namespace SheetCompressor.Json;

/// <summary>
/// Canonical SPEC §3.3 / §4.5 / §5.4 / §6.2 JSON serialization: 2-space
/// indentation, LF line endings, UTF-8 literal output (no <c>\uXXXX</c>
/// ASCII-escape of non-ASCII), trailing newline. Fixed key order per the
/// SPEC types. Optional fields are omitted when null/empty.
/// </summary>
public static class CanonicalJson
{
    public static string Serialize(AnchorJson json)
    {
        var sb = new StringBuilder();
        sb.Append("{\n");
        WriteString(sb, "  \"encoding\": ", json.Encoding);
        sb.Append(",\n");
        sb.Append("  \"version\": ").Append(json.Version).Append(",\n");
        sb.Append("  \"origin\": ");
        WriteOrigin(sb, json.Origin, indent: "  ");
        sb.Append(",\n");
        sb.Append("  \"cells\": ");
        if (json.Cells.Count == 0)
        {
            sb.Append("[]");
        }
        else
        {
            sb.Append("[\n");
            for (int i = 0; i < json.Cells.Count; i++)
            {
                var cell = json.Cells[i];
                sb.Append("    {\n");
                WriteString(sb, "      \"address\": ", cell.Address);
                sb.Append(",\n");
                WriteString(sb, "      \"value\": ", cell.Value);
                sb.Append('\n');
                sb.Append("    }");
                if (i < json.Cells.Count - 1) sb.Append(',');
                sb.Append('\n');
            }
            sb.Append("  ]");
        }
        sb.Append('\n');
        sb.Append("}\n");
        return sb.ToString();
    }

    public static string Serialize(InvertedIndexJson json)
    {
        var sb = new StringBuilder();
        sb.Append("{\n");
        WriteString(sb, "  \"encoding\": ", json.Encoding);
        sb.Append(",\n");
        sb.Append("  \"version\": ").Append(json.Version).Append(",\n");
        sb.Append("  \"origin\": ");
        WriteOrigin(sb, json.Origin, indent: "  ");
        sb.Append(",\n");
        sb.Append("  \"groups\": ");
        if (json.Groups.Count == 0)
        {
            sb.Append("[]");
        }
        else
        {
            sb.Append("[\n");
            for (int i = 0; i < json.Groups.Count; i++)
            {
                var g = json.Groups[i];
                sb.Append("    {\n");
                WriteString(sb, "      \"value\": ", g.Value);
                sb.Append(",\n");
                sb.Append("      \"ranges\": ");
                WriteStringArray(sb, g.Ranges, indent: "      ");
                sb.Append('\n');
                sb.Append("    }");
                if (i < json.Groups.Count - 1) sb.Append(',');
                sb.Append('\n');
            }
            sb.Append("  ]");
        }
        sb.Append('\n');
        sb.Append("}\n");
        return sb.ToString();
    }

    public static string Serialize(FormatAggregationJson json)
    {
        var sb = new StringBuilder();
        sb.Append("{\n");
        WriteString(sb, "  \"encoding\": ", json.Encoding);
        sb.Append(",\n");
        sb.Append("  \"version\": ").Append(json.Version).Append(",\n");
        sb.Append("  \"origin\": ");
        WriteOrigin(sb, json.Origin, indent: "  ");
        sb.Append(",\n");
        sb.Append("  \"groups\": ");
        if (json.Groups.Count == 0)
        {
            sb.Append("[]");
        }
        else
        {
            sb.Append("[\n");
            for (int i = 0; i < json.Groups.Count; i++)
            {
                var g = json.Groups[i];
                sb.Append("    {\n");
                WriteString(sb, "      \"type\": ", FormatAggregation.FormatTypeName(g.Type));
                sb.Append(",\n");
                sb.Append("      \"ranges\": ");
                WriteStringArray(sb, g.Ranges, indent: "      ");
                sb.Append('\n');
                sb.Append("    }");
                if (i < json.Groups.Count - 1) sb.Append(',');
                sb.Append('\n');
            }
            sb.Append("  ]");
        }
        sb.Append('\n');
        sb.Append("}\n");
        return sb.ToString();
    }

    public static string SerializeCharts(IReadOnlyList<ChartDescriptor> charts)
    {
        var sb = new StringBuilder();
        if (charts.Count == 0)
        {
            sb.Append("[]\n");
            return sb.ToString();
        }
        sb.Append("[\n");
        for (int i = 0; i < charts.Count; i++)
        {
            WriteChart(sb, charts[i], indent: "  ");
            if (i < charts.Count - 1) sb.Append(',');
            sb.Append('\n');
        }
        sb.Append("]\n");
        return sb.ToString();
    }

    private static void WriteChart(StringBuilder sb, ChartDescriptor chart, string indent)
    {
        sb.Append(indent).Append("{\n");
        var inner = indent + "  ";
        var written = false;

        WriteField(sb, inner, "name", chart.Name, ref written);
        WriteField(sb, inner, "type", ChartDescriptors.ChartTypeName(chart.Type), ref written);
        WriteField(sb, inner, "anchorRange", chart.AnchorRange, ref written);
        if (chart.Title is not null)
        {
            WriteField(sb, inner, "title", chart.Title, ref written);
        }
        if (chart.DataRanges is not null)
        {
            FinishPrev(sb, ref written);
            sb.Append(inner).Append("\"dataRanges\": ");
            WriteStringArray(sb, chart.DataRanges, indent: inner);
            written = true;
        }
        if (chart.Series is not null)
        {
            FinishPrev(sb, ref written);
            sb.Append(inner).Append("\"series\": ");
            WriteStringArray(sb, chart.Series, indent: inner);
            written = true;
        }
        if (chart.Axes is not null)
        {
            FinishPrev(sb, ref written);
            sb.Append(inner).Append("\"axes\": {");
            var axisInner = inner + "  ";
            var axisWritten = false;
            if (chart.Axes.X is not null)
            {
                sb.Append('\n');
                WriteField(sb, axisInner, "x", chart.Axes.X, ref axisWritten);
            }
            if (chart.Axes.Y is not null)
            {
                sb.Append(axisWritten ? ",\n" : "\n");
                sb.Append(axisInner).Append("\"y\": ");
                WriteJsonString(sb, chart.Axes.Y);
                axisWritten = true;
            }
            if (axisWritten)
            {
                sb.Append('\n').Append(inner).Append('}');
            }
            else
            {
                sb.Append('}');
            }
            written = true;
        }

        sb.Append('\n').Append(indent).Append('}');
    }

    private static void FinishPrev(StringBuilder sb, ref bool written)
    {
        if (written) sb.Append(",\n");
    }

    private static void WriteField(StringBuilder sb, string indent, string name, string value, ref bool written)
    {
        FinishPrev(sb, ref written);
        sb.Append(indent).Append('"').Append(name).Append("\": ");
        WriteJsonString(sb, value);
        written = true;
    }

    private static void WriteString(StringBuilder sb, string prefix, string value)
    {
        sb.Append(prefix);
        WriteJsonString(sb, value);
    }

    private static void WriteOrigin(StringBuilder sb, Origin origin, string indent)
    {
        var inner = indent + "  ";
        sb.Append("{\n");
        sb.Append(inner).Append("\"row\": ").Append(origin.Row.ToString(CultureInfo.InvariantCulture)).Append(",\n");
        sb.Append(inner).Append("\"col\": ").Append(origin.Col.ToString(CultureInfo.InvariantCulture)).Append('\n');
        sb.Append(indent).Append('}');
    }

    private static void WriteStringArray(StringBuilder sb, IReadOnlyList<string> values, string indent)
    {
        if (values.Count == 0)
        {
            sb.Append("[]");
            return;
        }
        sb.Append("[\n");
        var inner = indent + "  ";
        for (int i = 0; i < values.Count; i++)
        {
            sb.Append(inner);
            WriteJsonString(sb, values[i]);
            if (i < values.Count - 1) sb.Append(',');
            sb.Append('\n');
        }
        sb.Append(indent).Append(']');
    }

    /// <summary>
    /// Standard structural JSON string escaping: <c>"</c>, <c>\\</c>, named
    /// whitespace controls, <c>\u00XX</c> for other C0 controls. Non-ASCII
    /// characters pass through verbatim per SPEC §3.3 (UTF-8 literal output).
    /// </summary>
    internal static void WriteJsonString(StringBuilder sb, string value)
    {
        sb.Append('"');
        foreach (var ch in value)
        {
            switch (ch)
            {
                case '"': sb.Append("\\\""); break;
                case '\\': sb.Append("\\\\"); break;
                case '\b': sb.Append("\\b"); break;
                case '\f': sb.Append("\\f"); break;
                case '\n': sb.Append("\\n"); break;
                case '\r': sb.Append("\\r"); break;
                case '\t': sb.Append("\\t"); break;
                default:
                    if (ch < 0x20)
                    {
                        sb.Append("\\u").Append(((int)ch).ToString("x4", CultureInfo.InvariantCulture));
                    }
                    else
                    {
                        sb.Append(ch);
                    }
                    break;
            }
        }
        sb.Append('"');
    }
}
