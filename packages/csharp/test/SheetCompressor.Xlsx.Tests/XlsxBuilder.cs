using System.IO.Compression;
using System.Text;

namespace SheetCompressor.Xlsx.Tests;

/// <summary>
/// Minimal in-memory .xlsx builder used by adapter tests. Constructs an
/// OOXML zip containing one worksheet plus (optionally) one embedded chart.
/// Hand-assembled because ClosedXML's chart-authoring API is incomplete and
/// the adapter's chart parser is the most likely place to silently drift.
/// Mirrors the TypeScript port's xlsxBuilder.ts so the C# adapter is tested
/// against the same wire-level XML shape.
/// </summary>
public static class XlsxBuilder
{
    private const string NS_REL = "http://schemas.openxmlformats.org/package/2006/relationships";
    private const string NS_DOC = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

    public enum ChartKind { Bar, Line, Pie, Scatter, Area }

    public sealed record Anchor(int FromCol, int FromRow, int ToCol, int ToRow);

    public sealed record ChartSeriesSpec
    {
        public string? NameLiteral { get; init; }
        public string? ValuesRange { get; init; }
    }

    public sealed record ChartSpec
    {
        public required ChartKind ChartType { get; init; }
        public required Anchor Anchor { get; init; }
        public required string Name { get; init; }
        public string? Title { get; init; }
        public string? XAxisTitle { get; init; }
        public string? YAxisTitle { get; init; }
        public IReadOnlyList<ChartSeriesSpec>? Series { get; init; }
    }

    public sealed record CellInput(string? Text, double? Number, bool? Bool, string? Formula = null, string? ErrorValue = null);

    public sealed record SheetSpec
    {
        public required string Name { get; init; }
        public IReadOnlyList<IReadOnlyList<CellInput?>>? Rows { get; init; }
        /// <summary>1-indexed origin of the used range. Defaults to A1.</summary>
        public int OriginRow { get; init; } = 1;
        public int OriginCol { get; init; } = 1;
        public ChartSpec? Chart { get; init; }
    }

    public sealed record BuildOptions
    {
        public required IReadOnlyList<SheetSpec> Sheets { get; init; }
    }

    public static byte[] BuildXlsx(BuildOptions options)
    {
        var entries = new List<(string Name, byte[] Data)>();

        var contentTypes = new StringBuilder();
        contentTypes.Append("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n");
        contentTypes.Append("<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">\n");
        contentTypes.Append("<Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/>\n");
        contentTypes.Append("<Default Extension=\"xml\" ContentType=\"application/xml\"/>\n");
        contentTypes.Append("<Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/>\n");
        for (int i = 0; i < options.Sheets.Count; i++)
        {
            contentTypes.Append($"<Override PartName=\"/xl/worksheets/sheet{i + 1}.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/>\n");
            if (options.Sheets[i].Chart is not null)
            {
                contentTypes.Append($"<Override PartName=\"/xl/drawings/drawing{i + 1}.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.drawing+xml\"/>\n");
                contentTypes.Append($"<Override PartName=\"/xl/charts/chart{i + 1}.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.drawingml.chart+xml\"/>\n");
            }
        }
        contentTypes.Append("</Types>");
        entries.Add(("[Content_Types].xml", System.Text.Encoding.UTF8.GetBytes(contentTypes.ToString())));

        var rootRels = new StringBuilder();
        rootRels.Append("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n");
        rootRels.Append($"<Relationships xmlns=\"{NS_REL}\">\n");
        rootRels.Append($"<Relationship Id=\"rId1\" Type=\"{NS_DOC}/officeDocument\" Target=\"xl/workbook.xml\"/>\n");
        rootRels.Append("</Relationships>");
        entries.Add(("_rels/.rels", System.Text.Encoding.UTF8.GetBytes(rootRels.ToString())));

        var workbook = new StringBuilder();
        workbook.Append("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n");
        workbook.Append($"<workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" xmlns:r=\"{NS_DOC}\">\n<sheets>\n");
        for (int i = 0; i < options.Sheets.Count; i++)
        {
            workbook.Append($"<sheet name=\"{XmlEscape(options.Sheets[i].Name)}\" sheetId=\"{i + 1}\" r:id=\"rId{i + 1}\"/>\n");
        }
        workbook.Append("</sheets>\n</workbook>");
        entries.Add(("xl/workbook.xml", System.Text.Encoding.UTF8.GetBytes(workbook.ToString())));

        var workbookRels = new StringBuilder();
        workbookRels.Append("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n");
        workbookRels.Append($"<Relationships xmlns=\"{NS_REL}\">\n");
        for (int i = 0; i < options.Sheets.Count; i++)
        {
            workbookRels.Append($"<Relationship Id=\"rId{i + 1}\" Type=\"{NS_DOC}/worksheet\" Target=\"worksheets/sheet{i + 1}.xml\"/>\n");
        }
        workbookRels.Append("</Relationships>");
        entries.Add(("xl/_rels/workbook.xml.rels", System.Text.Encoding.UTF8.GetBytes(workbookRels.ToString())));

        for (int i = 0; i < options.Sheets.Count; i++)
        {
            var sheet = options.Sheets[i];
            entries.Add(($"xl/worksheets/sheet{i + 1}.xml", System.Text.Encoding.UTF8.GetBytes(BuildSheetXml(sheet, withDrawing: sheet.Chart is not null))));
            if (sheet.Chart is not null)
            {
                var sheetRels = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n"
                    + $"<Relationships xmlns=\"{NS_REL}\">\n"
                    + $"<Relationship Id=\"rIdDr1\" Type=\"{NS_DOC}/drawing\" Target=\"../drawings/drawing{i + 1}.xml\"/>\n"
                    + "</Relationships>";
                entries.Add(($"xl/worksheets/_rels/sheet{i + 1}.xml.rels", System.Text.Encoding.UTF8.GetBytes(sheetRels)));
                entries.Add(($"xl/drawings/drawing{i + 1}.xml", System.Text.Encoding.UTF8.GetBytes(BuildDrawingXml(sheet.Chart))));
                var drawingRels = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n"
                    + $"<Relationships xmlns=\"{NS_REL}\">\n"
                    + $"<Relationship Id=\"rIdCh1\" Type=\"{NS_DOC}/chart\" Target=\"../charts/chart{i + 1}.xml\"/>\n"
                    + "</Relationships>";
                entries.Add(($"xl/drawings/_rels/drawing{i + 1}.xml.rels", System.Text.Encoding.UTF8.GetBytes(drawingRels)));
                entries.Add(($"xl/charts/chart{i + 1}.xml", System.Text.Encoding.UTF8.GetBytes(BuildChartXml(sheet.Chart))));
            }
        }

        using var ms = new MemoryStream();
        using (var zip = new ZipArchive(ms, ZipArchiveMode.Create, leaveOpen: true))
        {
            foreach (var (name, data) in entries)
            {
                var e = zip.CreateEntry(name, CompressionLevel.Optimal);
                using var s = e.Open();
                s.Write(data, 0, data.Length);
            }
        }
        return ms.ToArray();
    }

    private static string BuildSheetXml(SheetSpec sheet, bool withDrawing)
    {
        var rows = sheet.Rows ?? new List<IReadOnlyList<CellInput?>>();
        int rowCount = rows.Count;
        int colCount = 0;
        foreach (var r in rows) colCount = Math.Max(colCount, r.Count);

        string dimRef;
        if (rowCount == 0 || colCount == 0)
        {
            dimRef = "A1";
        }
        else
        {
            int firstRow = sheet.OriginRow;
            int firstCol = sheet.OriginCol;
            int lastRow = firstRow + rowCount - 1;
            int lastCol = firstCol + colCount - 1;
            dimRef = $"{A1(firstRow, firstCol)}:{A1(lastRow, lastCol)}";
        }

        var sb = new StringBuilder();
        sb.Append("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n");
        sb.Append($"<worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" xmlns:r=\"{NS_DOC}\"><dimension ref=\"{dimRef}\"/><sheetData>");

        for (int r = 0; r < rows.Count; r++)
        {
            var row = rows[r];
            var rowNum = sheet.OriginRow + r;
            sb.Append($"<row r=\"{rowNum}\">");
            for (int c = 0; c < row.Count; c++)
            {
                var cell = row[c];
                if (cell is null) continue;
                var addr = A1(rowNum, sheet.OriginCol + c);
                if (cell.Formula is { } f)
                {
                    // Cell with a formula. The numeric value (cell.Number) is the
                    // cached result; the `<f>` element wins for dataType inference.
                    var v = cell.Number is { } fn ? fn.ToString(System.Globalization.CultureInfo.InvariantCulture) : "0";
                    sb.Append($"<c r=\"{addr}\"><f>{XmlEscape(f)}</f><v>{v}</v></c>");
                }
                else if (cell.ErrorValue is { } err)
                {
                    sb.Append($"<c r=\"{addr}\" t=\"e\"><v>{XmlEscape(err)}</v></c>");
                }
                else if (cell.Number is { } n)
                {
                    sb.Append($"<c r=\"{addr}\"><v>{n.ToString(System.Globalization.CultureInfo.InvariantCulture)}</v></c>");
                }
                else if (cell.Bool is { } b)
                {
                    sb.Append($"<c r=\"{addr}\" t=\"b\"><v>{(b ? 1 : 0)}</v></c>");
                }
                else if (cell.Text is { } t)
                {
                    sb.Append($"<c r=\"{addr}\" t=\"inlineStr\"><is><t>{XmlEscape(t)}</t></is></c>");
                }
            }
            sb.Append("</row>");
        }
        sb.Append("</sheetData>");
        if (withDrawing) sb.Append("<drawing r:id=\"rIdDr1\"/>");
        sb.Append("</worksheet>");
        return sb.ToString();
    }

    private static string BuildDrawingXml(ChartSpec spec)
    {
        var a = spec.Anchor;
        return "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n"
            + $"<xdr:wsDr xmlns:xdr=\"http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing\" xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\" xmlns:r=\"{NS_DOC}\" xmlns:c=\"http://schemas.openxmlformats.org/drawingml/2006/chart\">\n"
            + "<xdr:twoCellAnchor>\n"
            + $"<xdr:from><xdr:col>{a.FromCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>{a.FromRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>\n"
            + $"<xdr:to><xdr:col>{a.ToCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>{a.ToRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>\n"
            + $"<xdr:graphicFrame><xdr:nvGraphicFramePr><xdr:cNvPr id=\"2\" name=\"{XmlEscape(spec.Name)}\"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x=\"0\" y=\"0\"/><a:ext cx=\"0\" cy=\"0\"/></xdr:xfrm><a:graphic><a:graphicData uri=\"http://schemas.openxmlformats.org/drawingml/2006/chart\"><c:chart r:id=\"rIdCh1\"/></a:graphicData></a:graphic></xdr:graphicFrame>\n"
            + "<xdr:clientData/>\n"
            + "</xdr:twoCellAnchor>\n"
            + "</xdr:wsDr>";
    }

    private static readonly Dictionary<ChartKind, string> ChartBodyTag = new()
    {
        [ChartKind.Bar] = "barChart",
        [ChartKind.Line] = "lineChart",
        [ChartKind.Pie] = "pieChart",
        [ChartKind.Scatter] = "scatterChart",
        [ChartKind.Area] = "areaChart",
    };

    private static string BuildChartXml(ChartSpec spec)
    {
        var tag = ChartBodyTag[spec.ChartType];
        var title = spec.Title is null
            ? ""
            : $"<c:title><c:tx><c:rich><a:p><a:r><a:t>{XmlEscape(spec.Title)}</a:t></a:r></a:p></c:rich></c:tx></c:title>";
        var series = new StringBuilder();
        foreach (var s in spec.Series ?? new List<ChartSeriesSpec>())
        {
            var tx = s.NameLiteral is null ? "" : $"<c:tx><c:v>{XmlEscape(s.NameLiteral)}</c:v></c:tx>";
            var val = s.ValuesRange is null ? "" : $"<c:val><c:numRef><c:f>{XmlEscape(s.ValuesRange)}</c:f></c:numRef></c:val>";
            series.Append($"<c:ser>{tx}{val}</c:ser>");
        }
        var xAx = spec.XAxisTitle is null
            ? ""
            : $"<c:catAx><c:title><c:tx><c:rich><a:p><a:r><a:t>{XmlEscape(spec.XAxisTitle)}</a:t></a:r></a:p></c:rich></c:tx></c:title></c:catAx>";
        var yAx = spec.YAxisTitle is null
            ? ""
            : $"<c:valAx><c:title><c:tx><c:rich><a:p><a:r><a:t>{XmlEscape(spec.YAxisTitle)}</a:t></a:r></a:p></c:rich></c:tx></c:title></c:valAx>";
        return "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n"
            + $"<c:chartSpace xmlns:c=\"http://schemas.openxmlformats.org/drawingml/2006/chart\" xmlns:r=\"{NS_DOC}\" xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\">\n"
            + $"<c:chart>{title}<c:plotArea><c:layout/><c:{tag}>{series}</c:{tag}>{xAx}{yAx}</c:plotArea></c:chart>\n"
            + "</c:chartSpace>";
    }

    private static string XmlEscape(string s)
    {
        return s.Replace("&", "&amp;")
            .Replace("<", "&lt;")
            .Replace(">", "&gt;")
            .Replace("\"", "&quot;");
    }

    private static string A1(int row, int col)
    {
        return ColLetters(col) + row.ToString(System.Globalization.CultureInfo.InvariantCulture);
    }

    private static string ColLetters(int col)
    {
        var sb = new StringBuilder();
        int n = col;
        while (n > 0)
        {
            int rem = (n - 1) % 26;
            sb.Insert(0, (char)('A' + rem));
            n = (n - 1) / 26;
        }
        return sb.ToString();
    }

    public static CellInput TextCell(string text) => new(text, null, null);
    public static CellInput NumberCell(double number) => new(null, number, null);
    public static CellInput BoolCell(bool value) => new(null, null, value);
    public static CellInput FormulaCell(string formula, double cachedValue = 0) => new(null, cachedValue, null, Formula: formula);
    public static CellInput ErrorCell(string err) => new(null, null, null, ErrorValue: err);
}
