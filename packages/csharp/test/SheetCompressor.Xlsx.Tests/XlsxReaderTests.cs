using SheetCompressor;
using Xunit;
using static SheetCompressor.Xlsx.Tests.XlsxBuilder;

namespace SheetCompressor.Xlsx.Tests;

/// <summary>
/// Adapter tests assert the produced Grid directly (rows, origin, cellMeta,
/// charts) against small in-memory .xlsx files (SPEC §8.3) — NEVER the
/// compression output. The pure core is already covered by the shared golden
/// corpus; covering the adapter through Compress() would only re-test what
/// the corpus already does and would couple host concerns to the core's
/// contract.
/// </summary>
public class XlsxReaderTests
{
    private static byte[] Build(params SheetSpec[] sheets)
        => BuildXlsx(new BuildOptions { Sheets = sheets });

    private static SheetSpec OneSheet(string name, IReadOnlyList<IReadOnlyList<CellInput?>>? rows = null, int originRow = 1, int originCol = 1, ChartSpec? chart = null)
        => new() { Name = name, Rows = rows, OriginRow = originRow, OriginCol = originCol, Chart = chart };

    /* ------------------------------------------------------------------ */
    /* Empty / minimal workbooks                                          */
    /* ------------------------------------------------------------------ */

    [Fact]
    public void ReadSheet_EmptyWorkbook_ReturnsEmptyGridAnchoredAtA1()
    {
        var data = Build(OneSheet("Sheet1"));
        var g = XlsxReader.ReadSheet(data);
        Assert.Empty(g.Rows);
        Assert.Equal(new Origin(1, 1), g.Origin);
        Assert.Null(g.CellMeta);
        Assert.True(g.Charts is null || g.Charts.Count == 0);
    }

    [Fact]
    public void ReadSheet_A1AnchoredGrid_ReturnsRowsAndOriginAt1_1()
    {
        var data = Build(OneSheet("Sheet1", rows: new List<IReadOnlyList<CellInput?>>
        {
            new List<CellInput?> { TextCell("Name"), TextCell("Qty") },
            new List<CellInput?> { TextCell("Apple"), NumberCell(3) },
        }));
        var g = XlsxReader.ReadSheet(data);
        Assert.Equal(new Origin(1, 1), g.Origin);
        Assert.Equal(new[] { "Name", "Qty" }, g.Rows[0]);
        Assert.Equal(new[] { "Apple", "3" }, g.Rows[1]);
    }

    [Fact]
    public void ReadSheet_RespectsTrueOrigin_WhenDataStartsAwayFromA1()
    {
        // Data anchored at C5 (row=5, col=3). Used range = C5:D6.
        var data = Build(OneSheet("Sheet1",
            rows: new List<IReadOnlyList<CellInput?>>
            {
                new List<CellInput?> { TextCell("Name"), TextCell("Qty") },
                new List<CellInput?> { TextCell("Apple"), NumberCell(3) },
            },
            originRow: 5, originCol: 3));
        var g = XlsxReader.ReadSheet(data);
        Assert.Equal(new Origin(5, 3), g.Origin);
        Assert.Equal(new[] { "Name", "Qty" }, g.Rows[0]);
        Assert.Equal(new[] { "Apple", "3" }, g.Rows[1]);
    }

    [Fact]
    public void ReadSheet_FillsInternalGapsAsEmpty_NoRaggedRows()
    {
        // Row 1: B1 only. Row 2: A2 + C2. Used range A1:C2; gap at A1, C1, B2 → "".
        var data = Build(OneSheet("Sheet1", rows: new List<IReadOnlyList<CellInput?>>
        {
            new List<CellInput?> { null, TextCell("B1val"), null },
            new List<CellInput?> { TextCell("A2val"), null, NumberCell(7) },
        }));
        var g = XlsxReader.ReadSheet(data);
        Assert.Equal(new[] { "", "B1val", "" }, g.Rows[0]);
        Assert.Equal(new[] { "A2val", "", "7" }, g.Rows[1]);
        Assert.Equal(new Origin(1, 1), g.Origin);
    }

    /* ------------------------------------------------------------------ */
    /* Sheet selection                                                    */
    /* ------------------------------------------------------------------ */

    [Fact]
    public void ReadSheet_DefaultsToFirstSheet()
    {
        var data = Build(
            OneSheet("First", rows: new List<IReadOnlyList<CellInput?>>
            {
                new List<CellInput?> { TextCell("A") },
            }),
            OneSheet("Second", rows: new List<IReadOnlyList<CellInput?>>
            {
                new List<CellInput?> { TextCell("B") },
            }));
        var g = XlsxReader.ReadSheet(data);
        Assert.Equal("A", g.Rows[0][0]);
    }

    [Fact]
    public void ReadSheet_SelectsByName()
    {
        var data = Build(
            OneSheet("First", rows: new List<IReadOnlyList<CellInput?>>
            {
                new List<CellInput?> { TextCell("A") },
            }),
            OneSheet("Second", rows: new List<IReadOnlyList<CellInput?>>
            {
                new List<CellInput?> { TextCell("B") },
            }));
        var g = XlsxReader.ReadSheet(data, new ReadSheetOptions { SheetName = "Second" });
        Assert.Equal("B", g.Rows[0][0]);
    }

    [Fact]
    public void ReadSheet_SelectsByIndex()
    {
        var data = Build(
            OneSheet("First", rows: new List<IReadOnlyList<CellInput?>>
            {
                new List<CellInput?> { TextCell("A") },
            }),
            OneSheet("Second", rows: new List<IReadOnlyList<CellInput?>>
            {
                new List<CellInput?> { TextCell("B") },
            }));
        var g = XlsxReader.ReadSheet(data, new ReadSheetOptions { SheetIndex = 1 });
        Assert.Equal("B", g.Rows[0][0]);
    }

    [Fact]
    public void ReadSheet_ThrowsOnUnknownSheetName()
    {
        var data = Build(OneSheet("Sheet1", rows: new List<IReadOnlyList<CellInput?>>
        {
            new List<CellInput?> { TextCell("A") },
        }));
        Assert.Throws<ArgumentException>(() => XlsxReader.ReadSheet(data, new ReadSheetOptions { SheetName = "Missing" }));
    }

    [Fact]
    public void ReadSheet_ThrowsOnIndexOutOfRange()
    {
        var data = Build(OneSheet("Sheet1", rows: new List<IReadOnlyList<CellInput?>>
        {
            new List<CellInput?> { TextCell("A") },
        }));
        Assert.Throws<ArgumentOutOfRangeException>(() => XlsxReader.ReadSheet(data, new ReadSheetOptions { SheetIndex = 5 }));
    }

    /* ------------------------------------------------------------------ */
    /* cellMeta dataType                                                  */
    /* ------------------------------------------------------------------ */

    [Fact]
    public void ReadSheet_DataTypeMapping_CoversTextNumberBoolFormulaError()
    {
        var data = Build(OneSheet("Sheet1", rows: new List<IReadOnlyList<CellInput?>>
        {
            new List<CellInput?>
            {
                TextCell("hello"),
                NumberCell(42),
                BoolCell(true),
                FormulaCell("1+6", cachedValue: 7),
                ErrorCell("#REF!"),
            },
        }));
        var g = XlsxReader.ReadSheet(data);
        Assert.NotNull(g.CellMeta);
        var row0 = g.CellMeta![0]!;
        Assert.Equal(DataType.Text, row0[0]!.DataType);
        Assert.Equal(DataType.Number, row0[1]!.DataType);
        Assert.Equal(DataType.Bool, row0[2]!.DataType);
        Assert.Equal(DataType.Formula, row0[3]!.DataType);
        Assert.Equal(DataType.Error, row0[4]!.DataType);
    }

    [Fact]
    public void ReadSheet_GapCellsAreEmptyDataType()
    {
        // A1 text, B1 gap, C1 number → A1:C1 with empty in the middle.
        var data = Build(OneSheet("Sheet1", rows: new List<IReadOnlyList<CellInput?>>
        {
            new List<CellInput?> { TextCell("x"), null, NumberCell(3) },
        }));
        var g = XlsxReader.ReadSheet(data);
        Assert.NotNull(g.CellMeta);
        var row0 = g.CellMeta![0]!;
        Assert.Equal(DataType.Text, row0[0]!.DataType);
        Assert.Equal(DataType.Empty, row0[1]!.DataType);
        Assert.Equal(DataType.Number, row0[2]!.DataType);
    }

    [Fact]
    public void ReadSheet_OmitsCellMetaForEmptySheet()
    {
        var data = Build(OneSheet("Sheet1"));
        var g = XlsxReader.ReadSheet(data);
        Assert.Null(g.CellMeta);
    }

    /* ------------------------------------------------------------------ */
    /* Chart extraction                                                   */
    /* ------------------------------------------------------------------ */

    [Fact]
    public void ReadSheet_ExtractsBarChartWithTitleAxesSeriesData()
    {
        var data = Build(OneSheet("Sheet1",
            rows: new List<IReadOnlyList<CellInput?>>
            {
                new List<CellInput?> { TextCell("Quarter"), TextCell("Sales") },
                new List<CellInput?> { TextCell("Q1"), NumberCell(100) },
                new List<CellInput?> { TextCell("Q2"), NumberCell(150) },
                new List<CellInput?> { TextCell("Q3"), NumberCell(200) },
            },
            chart: new ChartSpec
            {
                ChartType = ChartKind.Bar,
                // anchor from B5 to F20 (xdr uses 0-indexed)
                Anchor = new Anchor(FromCol: 1, FromRow: 4, ToCol: 5, ToRow: 19),
                Name = "Q1Sales",
                Title = "Sales",
                XAxisTitle = "Quarter",
                YAxisTitle = "Amount",
                Series = new List<ChartSeriesSpec>
                {
                    new() { NameLiteral = "Sales", ValuesRange = "Sheet1!$B$2:$B$4" },
                },
            }));
        var g = XlsxReader.ReadSheet(data);
        Assert.NotNull(g.Charts);
        Assert.Single(g.Charts!);
        var c = g.Charts![0];
        Assert.Equal("Q1Sales", c.Name);
        Assert.Equal(ChartType.Bar, c.Type);
        Assert.Equal("B5:F20", c.AnchorRange);
        Assert.Equal("Sales", c.Title);
        Assert.NotNull(c.Axes);
        Assert.Equal("Quarter", c.Axes!.X);
        Assert.Equal("Amount", c.Axes.Y);
        Assert.Equal(new[] { "Sales" }, c.Series);
        Assert.Equal(new[] { "B2:B4" }, c.DataRanges);
    }

    [Theory]
    [InlineData(ChartKind.Bar, ChartType.Bar)]
    [InlineData(ChartKind.Line, ChartType.Line)]
    [InlineData(ChartKind.Pie, ChartType.Pie)]
    [InlineData(ChartKind.Scatter, ChartType.Scatter)]
    [InlineData(ChartKind.Area, ChartType.Area)]
    public void ReadSheet_MapsChartTypeElementToVocabulary(ChartKind input, ChartType expected)
    {
        var data = Build(OneSheet("Sheet1",
            rows: new List<IReadOnlyList<CellInput?>>
            {
                new List<CellInput?> { TextCell("x") },
            },
            chart: new ChartSpec
            {
                ChartType = input,
                Anchor = new Anchor(0, 0, 1, 1),
                Name = "c",
            }));
        var g = XlsxReader.ReadSheet(data);
        Assert.NotNull(g.Charts);
        Assert.Single(g.Charts!);
        Assert.Equal(expected, g.Charts![0].Type);
    }

    [Fact]
    public void ReadSheet_NoChartsReturnsEmpty()
    {
        var data = Build(OneSheet("Sheet1", rows: new List<IReadOnlyList<CellInput?>>
        {
            new List<CellInput?> { TextCell("x") },
        }));
        var g = XlsxReader.ReadSheet(data);
        Assert.True(g.Charts is null || g.Charts.Count == 0);
    }

    /* ------------------------------------------------------------------ */
    /* Error paths                                                        */
    /* ------------------------------------------------------------------ */

    [Fact]
    public void ReadSheet_ThrowsOnGarbageBytes()
    {
        Assert.ThrowsAny<Exception>(() => XlsxReader.ReadSheet(System.Text.Encoding.UTF8.GetBytes("not a workbook")));
    }

    [Fact]
    public void ReadSheetFile_ThrowsOnMissingFile()
    {
        Assert.Throws<FileNotFoundException>(() => XlsxReader.ReadSheetFile("/tmp/does-not-exist-sheetcompressor-xlsx.xlsx"));
    }

    [Fact]
    public void ReadSheetFile_ReadsXlsxFromDisk()
    {
        var data = Build(OneSheet("Sheet1", rows: new List<IReadOnlyList<CellInput?>>
        {
            new List<CellInput?> { TextCell("disk"), NumberCell(1) },
        }));
        var path = Path.GetTempFileName() + ".xlsx";
        try
        {
            File.WriteAllBytes(path, data);
            var g = XlsxReader.ReadSheetFile(path);
            Assert.Equal(new[] { "disk", "1" }, g.Rows[0]);
        }
        finally
        {
            File.Delete(path);
        }
    }
}
