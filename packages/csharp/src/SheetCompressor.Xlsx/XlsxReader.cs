using System.Globalization;
using ClosedXML.Excel;

namespace SheetCompressor.Xlsx;

/// <summary>
/// Optional .xlsx adapter (Seam 2 in the PRD): reads a single sheet — grid,
/// origin, per-cell data type, and embedded chart descriptors — into the
/// core's input contract (<see cref="Grid"/>, see SheetCompressor/Types.cs).
///
/// Ships as a separate NuGet package <c>SheetCompressor.Xlsx</c> so the pure
/// core can be installed without ClosedXML (SPEC §8.2). Consumers who never
/// call this adapter never pay the ClosedXML cost.
///
/// Cells come from ClosedXML; chart descriptors are extracted by walking the
/// OOXML zip directly, because ClosedXML's chart-read API is incomplete and
/// the OOXML drawing/chart parts carry the data we need verbatim. This is the
/// same shape as the TypeScript / Go adapters' chart parsers.
/// </summary>
public static class XlsxReader
{
    public static Grid ReadSheet(byte[] data, ReadSheetOptions? options = null)
    {
        if (data is null) throw new ArgumentNullException(nameof(data));
        using var ms = new MemoryStream(data, writable: false);
        return ReadSheetCore(ms, data, options);
    }

    public static Grid ReadSheet(Stream stream, ReadSheetOptions? options = null)
    {
        if (stream is null) throw new ArgumentNullException(nameof(stream));
        // Both ClosedXML and the chart-extraction pass need full random access;
        // a forward-only stream would force us to buffer twice. Materialize once.
        byte[] buf;
        if (stream is MemoryStream existing && existing.TryGetBuffer(out var seg))
        {
            buf = new byte[seg.Count];
            Buffer.BlockCopy(seg.Array!, seg.Offset, buf, 0, seg.Count);
        }
        else
        {
            using var ms = new MemoryStream();
            stream.CopyTo(ms);
            buf = ms.ToArray();
        }
        using var input = new MemoryStream(buf, writable: false);
        return ReadSheetCore(input, buf, options);
    }

    public static Grid ReadSheetFile(string path, ReadSheetOptions? options = null)
    {
        if (path is null) throw new ArgumentNullException(nameof(path));
        var data = File.ReadAllBytes(path);
        return ReadSheet(data, options);
    }

    private static Grid ReadSheetCore(Stream xlsx, byte[] rawBytes, ReadSheetOptions? options)
    {
        options ??= new ReadSheetOptions();
        using var wb = new XLWorkbook(xlsx);
        var sheets = wb.Worksheets.ToList();
        if (sheets.Count == 0)
        {
            throw new InvalidDataException("ReadSheet: workbook contains no sheets");
        }

        int sheetIndex;
        IXLWorksheet ws;
        if (options.SheetName is { } name)
        {
            int idx = -1;
            for (int i = 0; i < sheets.Count; i++)
            {
                if (sheets[i].Name == name) { idx = i; break; }
            }
            if (idx < 0)
            {
                throw new ArgumentException(
                    $"ReadSheet: sheet \"{name}\" not found (available: {string.Join(", ", sheets.Select(s => s.Name))})",
                    nameof(options));
            }
            sheetIndex = idx;
            ws = sheets[idx];
        }
        else
        {
            sheetIndex = options.SheetIndex;
            if (sheetIndex < 0 || sheetIndex >= sheets.Count)
            {
                throw new ArgumentOutOfRangeException(
                    nameof(options),
                    $"ReadSheet: sheet index {sheetIndex} out of range (workbook has {sheets.Count} sheet(s))");
            }
            ws = sheets[sheetIndex];
        }

        var grid = BuildGrid(ws);
        var charts = ChartExtractor.Extract(rawBytes, sheetIndex);
        if (charts.Count > 0)
        {
            grid = grid with { Charts = charts };
        }
        return grid;
    }

    /// <summary>
    /// Build the SPEC §1 Grid: bounding-box of all "real" cells, gaps as "".
    /// CellMeta is populated for every covered cell when the sheet has any
    /// content; omitted entirely on a fully empty sheet (SPEC §8.1).
    /// </summary>
    private static Grid BuildGrid(IXLWorksheet ws)
    {
        // CellsUsed() returns every cell with a value or formula. We exclude
        // styled-but-empty cells (default options) so an isolated formatting
        // change doesn't expand the used range.
        var usedCells = ws.CellsUsed(XLCellsUsedOptions.AllContents).ToList();
        if (usedCells.Count == 0)
        {
            return new Grid
            {
                Rows = new List<IReadOnlyList<string>>(),
                Origin = new Origin(1, 1),
            };
        }

        int minRow = int.MaxValue, minCol = int.MaxValue, maxRow = 0, maxCol = 0;
        foreach (var cell in usedCells)
        {
            var r = cell.Address.RowNumber;
            var c = cell.Address.ColumnNumber;
            if (r < minRow) minRow = r;
            if (c < minCol) minCol = c;
            if (r > maxRow) maxRow = r;
            if (c > maxCol) maxCol = c;
        }

        int rowCount = maxRow - minRow + 1;
        int colCount = maxCol - minCol + 1;
        var rows = new List<IReadOnlyList<string>>(rowCount);
        var cellMeta = new List<IReadOnlyList<CellMeta?>?>(rowCount);
        for (int r = minRow; r <= maxRow; r++)
        {
            var rowVals = new string[colCount];
            var rowMeta = new CellMeta?[colCount];
            for (int c = minCol; c <= maxCol; c++)
            {
                var cell = ws.Cell(r, c);
                rowVals[c - minCol] = CellText(cell);
                rowMeta[c - minCol] = new CellMeta { DataType = InferDataType(cell) };
            }
            rows.Add(rowVals);
            cellMeta.Add(rowMeta);
        }

        return new Grid
        {
            Rows = rows,
            Origin = new Origin(minRow, minCol),
            CellMeta = cellMeta,
        };
    }

    /// <summary>
    /// Stringify a cell. ClosedXML lazily creates blank cells when accessed by
    /// address, so we check IsEmpty() first so gap cells render as "". For
    /// formula cells we read the cached value (CachedValue) rather than
    /// recomputing — the spec only requires the displayed text of the cell.
    /// </summary>
    private static string CellText(IXLCell cell)
    {
        if (cell.IsEmpty(XLCellsUsedOptions.AllContents)) return "";
        var value = cell.Value;
        if (value.IsBlank) return "";
        if (value.IsError) return value.GetError().ToString();
        if (value.IsBoolean) return value.GetBoolean() ? "TRUE" : "FALSE";
        if (value.IsNumber)
        {
            return value.GetNumber().ToString("R", CultureInfo.InvariantCulture);
        }
        if (value.IsDateTime)
        {
            return value.GetDateTime().ToString("o", CultureInfo.InvariantCulture);
        }
        if (value.IsTimeSpan)
        {
            return value.GetTimeSpan().ToString();
        }
        if (value.IsText) return value.GetText();
        return value.ToString(CultureInfo.InvariantCulture) ?? "";
    }

    /// <summary>
    /// Map ClosedXML's XLDataType to the SPEC §1 DataType vocabulary. Formula
    /// wins over evaluated type (matches the TS / Go adapters): a =SUM() cell
    /// collapses to <c>"formula"</c> regardless of the cached value's type.
    /// </summary>
    private static DataType InferDataType(IXLCell cell)
    {
        if (cell.IsEmpty(XLCellsUsedOptions.AllContents)) return DataType.Empty;
        if (cell.HasFormula) return DataType.Formula;
        var dt = cell.DataType;
        return dt switch
        {
            XLDataType.Text => DataType.Text,
            XLDataType.Number => DataType.Number,
            XLDataType.Boolean => DataType.Bool,
            XLDataType.DateTime => DataType.Date,
            XLDataType.TimeSpan => DataType.Date,
            XLDataType.Error => DataType.Error,
            XLDataType.Blank => DataType.Empty,
            _ => DataType.Text,
        };
    }
}
