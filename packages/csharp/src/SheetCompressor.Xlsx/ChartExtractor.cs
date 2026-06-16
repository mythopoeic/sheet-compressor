using System.Globalization;
using System.IO.Compression;
using System.Text.RegularExpressions;

namespace SheetCompressor.Xlsx;

/// <summary>
/// Chart extraction walks the workbook zip directly: locate the drawing part
/// for the requested sheet, follow the drawing's chart rels, and parse each
/// chart XML part. SPEC §8.1 keeps chart support best-effort; partial
/// descriptors (e.g. anchor + type only) are valid output.
///
/// Mirrors the Go / TypeScript adapters' parsers: regex on the raw XML rather
/// than a full XML DOM. The OOXML chart XML is regular enough — and the
/// fields we want (chart-body element, title text, axis blocks, ser blocks)
/// are tagged unambiguously — that a DOM walk would only add code without
/// shifting risk. Both the prefixed (<c>c:title</c>) and unprefixed
/// (<c>title</c>) forms are matched so the same parser handles writers that
/// elide the default namespace prefix.
/// </summary>
internal static class ChartExtractor
{
    public static IReadOnlyList<ChartDescriptor> Extract(byte[] data, int sheetIndex)
    {
        Dictionary<string, string> files;
        try
        {
            files = ReadZipFiles(data);
        }
        catch
        {
            return Array.Empty<ChartDescriptor>();
        }

        var sheetPath = $"xl/worksheets/sheet{sheetIndex + 1}.xml";
        if (!files.TryGetValue(sheetPath, out var sheetXml)) return Array.Empty<ChartDescriptor>();
        var drawingRelMatch = DrawingRefRE.Match(sheetXml);
        if (!drawingRelMatch.Success) return Array.Empty<ChartDescriptor>();
        var drawingRelId = drawingRelMatch.Groups[1].Value;

        var sheetRelsPath = $"xl/worksheets/_rels/sheet{sheetIndex + 1}.xml.rels";
        files.TryGetValue(sheetRelsPath, out var sheetRelsXml);
        var sheetRels = ParseRels(sheetRelsXml ?? "");
        if (!sheetRels.TryGetValue(drawingRelId, out var drawingRel)) return Array.Empty<ChartDescriptor>();
        var drawingPath = ResolveRelTarget(sheetPath, drawingRel.Target);
        if (!files.TryGetValue(drawingPath, out var drawingXml)) return Array.Empty<ChartDescriptor>();

        var drawingRelsPath = DrawingRelsPathFor(drawingPath);
        files.TryGetValue(drawingRelsPath, out var drawingRelsXml);
        var drawingRels = ParseRels(drawingRelsXml ?? "");

        var charts = new List<ChartDescriptor>();
        foreach (Match m in TwoCellAnchorRE.Matches(drawingXml))
        {
            var anchor = m.Value;
            var chartRefMatch = ChartRefRE.Match(anchor);
            if (!chartRefMatch.Success) continue;
            if (!drawingRels.TryGetValue(chartRefMatch.Groups[1].Value, out var chartRel)) continue;
            var chartPath = ResolveRelTarget(drawingPath, chartRel.Target);
            if (!files.TryGetValue(chartPath, out var chartXml)) continue;
            var anchorRange = AnchorRangeFromDrawing(anchor);
            if (anchorRange is null) continue;

            var parsed = ParseChartXml(chartXml);
            charts.Add(new ChartDescriptor
            {
                Name = NameFromAnchor(anchor),
                Type = parsed.Type,
                AnchorRange = anchorRange,
                Title = parsed.Title,
                Series = parsed.Series,
                DataRanges = parsed.DataRanges,
                Axes = parsed.Axes,
            });
        }
        return charts;
    }

    /* ------------------------------------------------------------------ */
    /* Zip helpers                                                        */
    /* ------------------------------------------------------------------ */

    private static Dictionary<string, string> ReadZipFiles(byte[] data)
    {
        using var ms = new MemoryStream(data, writable: false);
        using var zip = new ZipArchive(ms, ZipArchiveMode.Read);
        var files = new Dictionary<string, string>(zip.Entries.Count);
        foreach (var entry in zip.Entries)
        {
            using var stream = entry.Open();
            using var reader = new StreamReader(stream, System.Text.Encoding.UTF8);
            files[entry.FullName] = reader.ReadToEnd();
        }
        return files;
    }

    /* ------------------------------------------------------------------ */
    /* Rels                                                               */
    /* ------------------------------------------------------------------ */

    private readonly record struct RelEntry(string Type, string Target);

    // OOXML writers (ClosedXML, SheetJS, excelize) write <Relationship>'s
    // attributes in different orders, so we match the element first and pull
    // each attribute by name. Same approach the Go adapter took.
    private static readonly Regex RelElemRE = new(@"<Relationship\s+[^>]*?/?>", RegexOptions.Compiled);
    private static readonly Regex RelAttrRE = new(@"\b([A-Za-z]+)=""([^""]*)""", RegexOptions.Compiled);

    private static Dictionary<string, RelEntry> ParseRels(string xml)
    {
        var result = new Dictionary<string, RelEntry>();
        foreach (Match elem in RelElemRE.Matches(xml))
        {
            var attrs = new Dictionary<string, string>();
            foreach (Match m in RelAttrRE.Matches(elem.Value))
            {
                attrs[m.Groups[1].Value] = m.Groups[2].Value;
            }
            if (!attrs.TryGetValue("Id", out var id)) continue;
            attrs.TryGetValue("Type", out var type);
            attrs.TryGetValue("Target", out var target);
            result[id] = new RelEntry(type ?? "", target ?? "");
        }
        return result;
    }

    private static string ResolveRelTarget(string partPath, string target)
    {
        if (target.StartsWith("/", StringComparison.Ordinal)) return target.TrimStart('/');
        var parent = partPath.Split('/').ToList();
        parent.RemoveAt(parent.Count - 1);
        var rel = target.Split('/').ToList();
        while (rel.Count > 0 && rel[0] == "..")
        {
            rel.RemoveAt(0);
            if (parent.Count > 0) parent.RemoveAt(parent.Count - 1);
        }
        return string.Join("/", parent.Concat(rel));
    }

    private static string DrawingRelsPathFor(string drawingPath)
    {
        int idx = drawingPath.LastIndexOf('/');
        if (idx < 0) return "_rels/" + drawingPath + ".rels";
        return drawingPath.Substring(0, idx) + "/_rels/" + drawingPath.Substring(idx + 1) + ".rels";
    }

    /* ------------------------------------------------------------------ */
    /* Drawing-level extractors                                           */
    /* ------------------------------------------------------------------ */

    private static readonly Regex DrawingRefRE = new(@"<drawing\s+[^>]*?r:id=""([^""]+)""", RegexOptions.Compiled);
    private static readonly Regex TwoCellAnchorRE = new(
        @"<xdr:(?:twoCellAnchor|oneCellAnchor|absoluteAnchor)\b[\s\S]*?</xdr:(?:twoCellAnchor|oneCellAnchor|absoluteAnchor)>",
        RegexOptions.Compiled);
    private static readonly Regex ChartRefRE = new(@"<c:chart\s+[^>]*?r:id=""([^""]+)""", RegexOptions.Compiled);
    private static readonly Regex AnchorRE = new(
        @"<xdr:from>[\s\S]*?<xdr:col>(\d+)</xdr:col>[\s\S]*?<xdr:row>(\d+)</xdr:row>[\s\S]*?</xdr:from>[\s\S]*?<xdr:to>[\s\S]*?<xdr:col>(\d+)</xdr:col>[\s\S]*?<xdr:row>(\d+)</xdr:row>[\s\S]*?</xdr:to>",
        RegexOptions.Compiled);
    private static readonly Regex NameRE = new(@"<xdr:cNvPr\s+[^>]*?\bname=""([^""]*)""", RegexOptions.Compiled);

    private static string? AnchorRangeFromDrawing(string scope)
    {
        var m = AnchorRE.Match(scope);
        if (!m.Success) return null;
        int fc = int.Parse(m.Groups[1].Value, CultureInfo.InvariantCulture);
        int fr = int.Parse(m.Groups[2].Value, CultureInfo.InvariantCulture);
        int tc = int.Parse(m.Groups[3].Value, CultureInfo.InvariantCulture);
        int tr = int.Parse(m.Groups[4].Value, CultureInfo.InvariantCulture);
        return $"{Address.A1(fr + 1, fc + 1)}:{Address.A1(tr + 1, tc + 1)}";
    }

    private static string NameFromAnchor(string scope)
    {
        var m = NameRE.Match(scope);
        return m.Success ? m.Groups[1].Value : "";
    }

    /* ------------------------------------------------------------------ */
    /* Chart-XML parsing                                                  */
    /* ------------------------------------------------------------------ */

    private static readonly Dictionary<string, ChartType> ChartBodyToType = new()
    {
        ["barChart"] = ChartType.Bar,
        ["bar3DChart"] = ChartType.Bar,
        ["lineChart"] = ChartType.Line,
        ["line3DChart"] = ChartType.Line,
        ["pieChart"] = ChartType.Pie,
        ["pie3DChart"] = ChartType.Pie,
        ["doughnutChart"] = ChartType.Pie,
        ["scatterChart"] = ChartType.Scatter,
        ["bubbleChart"] = ChartType.Scatter,
        ["areaChart"] = ChartType.Area,
        ["area3DChart"] = ChartType.Area,
    };

    private static readonly Regex ATextRE = new(@"<a:t[^>]*>([\s\S]*?)</a:t>", RegexOptions.Compiled);
    private static readonly Regex TitleRE = new(@"<(?:c:)?title>([\s\S]*?)</(?:c:)?title>", RegexOptions.Compiled);
    private static readonly Regex ChartScopeRE = new(@"<(?:c:)?chart>([\s\S]*?)</(?:c:)?chart>", RegexOptions.Compiled);
    private static readonly Regex PlotAreaRE = new(@"<(?:c:)?plotArea>[\s\S]*?</(?:c:)?plotArea>", RegexOptions.Compiled);
    private static readonly Regex CatAxRE = new(@"<(?:c:)?(?:catAx|dateAx)>([\s\S]*?)</(?:c:)?(?:catAx|dateAx)>", RegexOptions.Compiled);
    private static readonly Regex ValAxRE = new(@"<(?:c:)?valAx>([\s\S]*?)</(?:c:)?valAx>", RegexOptions.Compiled);
    private static readonly Regex SerRE = new(@"<(?:c:)?ser>([\s\S]*?)</(?:c:)?ser>", RegexOptions.Compiled);
    private static readonly Regex TxRE = new(@"<(?:c:)?tx>([\s\S]*?)</(?:c:)?tx>", RegexOptions.Compiled);
    private static readonly Regex ValBlockRE = new(@"<(?:c:)?val>([\s\S]*?)</(?:c:)?val>", RegexOptions.Compiled);
    private static readonly Regex CatBlockRE = new(@"<(?:c:)?cat>([\s\S]*?)</(?:c:)?cat>", RegexOptions.Compiled);

    private static string DecodeXmlText(string s)
    {
        return s.Replace("&lt;", "<")
            .Replace("&gt;", ">")
            .Replace("&quot;", "\"")
            .Replace("&apos;", "'")
            .Replace("&amp;", "&");
    }

    private static string? ExtractRichText(string scope)
    {
        var parts = new List<string>();
        foreach (Match m in ATextRE.Matches(scope))
        {
            parts.Add(DecodeXmlText(m.Groups[1].Value));
        }
        return parts.Count == 0 ? null : string.Concat(parts);
    }

    private static string? ExtractTitle(string scope)
    {
        var m = TitleRE.Match(scope);
        return m.Success ? ExtractRichText(m.Groups[1].Value) : null;
    }

    private static string? ExtractFieldText(string xml, string tag)
    {
        var re = new Regex($@"<(?:c:)?{tag}>([\s\S]*?)</(?:c:)?{tag}>");
        var m = re.Match(xml);
        return m.Success ? DecodeXmlText(m.Groups[1].Value.Trim()) : null;
    }

    /// <summary>
    /// Normalise a chart cell-reference (<c>Sheet1!$B$2:$B$4</c> → <c>B2:B4</c>).
    /// </summary>
    private static string NormalizeRange(string r)
    {
        int bang = r.LastIndexOf('!');
        if (bang >= 0) r = r.Substring(bang + 1);
        r = r.Replace("$", "");
        return r.Trim('\'');
    }

    private readonly record struct ParsedChart(
        ChartType Type,
        string? Title,
        IReadOnlyList<string>? DataRanges,
        IReadOnlyList<string>? Series,
        ChartAxes? Axes);

    private static ParsedChart ParseChartXml(string xml)
    {
        var chartType = ChartType.Other;
        foreach (var (tag, t) in ChartBodyToType)
        {
            var re = new Regex($@"<(?:c:)?{tag}[ >]");
            if (re.IsMatch(xml))
            {
                chartType = t;
                break;
            }
        }

        var chartScopeMatch = ChartScopeRE.Match(xml);
        var chartScope = chartScopeMatch.Success ? chartScopeMatch.Groups[1].Value : xml;
        var titleScope = PlotAreaRE.Replace(chartScope, "");
        var title = ExtractTitle(titleScope);

        string? axisX = null, axisY = null;
        var xMatch = CatAxRE.Match(xml);
        if (xMatch.Success) axisX = ExtractTitle(xMatch.Groups[1].Value);
        var yMatch = ValAxRE.Match(xml);
        if (yMatch.Success) axisY = ExtractTitle(yMatch.Groups[1].Value);
        ChartAxes? axes = null;
        if (axisX is not null || axisY is not null)
        {
            axes = new ChartAxes { X = axisX, Y = axisY };
        }

        var series = new List<string>();
        var data = new List<string>();
        foreach (Match ser in SerRE.Matches(xml))
        {
            var serScope = ser.Groups[1].Value;
            var tx = TxRE.Match(serScope);
            if (tx.Success)
            {
                var literal = ExtractFieldText(tx.Groups[1].Value, "v");
                if (literal is not null) series.Add(literal);
                else
                {
                    var cellRef = ExtractFieldText(tx.Groups[1].Value, "f");
                    if (cellRef is not null) series.Add(NormalizeRange(cellRef));
                }
            }
            string? valBlock = null;
            var v = ValBlockRE.Match(serScope);
            if (v.Success) valBlock = v.Groups[1].Value;
            else
            {
                var cat = CatBlockRE.Match(serScope);
                if (cat.Success) valBlock = cat.Groups[1].Value;
            }
            if (valBlock is not null)
            {
                var cellRef = ExtractFieldText(valBlock, "f");
                if (cellRef is not null) data.Add(NormalizeRange(cellRef));
            }
        }

        return new ParsedChart(
            Type: chartType,
            Title: title,
            DataRanges: data.Count == 0 ? null : data,
            Series: series.Count == 0 ? null : series,
            Axes: axes);
    }
}
