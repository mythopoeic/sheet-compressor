using System.Collections.Generic;

namespace SheetCompressor;

public readonly record struct Origin(int Row, int Col);

public enum DataType
{
    Empty,
    Text,
    Number,
    Date,
    Bool,
    Formula,
    Error,
}

public sealed record CellMeta
{
    public DataType? DataType { get; init; }
}

public enum ChartType
{
    Bar,
    Line,
    Pie,
    Scatter,
    Area,
    Other,
}

public sealed record ChartDescriptor
{
    public required string Name { get; init; }
    public required ChartType Type { get; init; }
    public required string AnchorRange { get; init; }
    public string? Title { get; init; }
    public IReadOnlyList<string>? DataRanges { get; init; }
    public IReadOnlyList<string>? Series { get; init; }
    public ChartAxes? Axes { get; init; }
}

public sealed record ChartAxes
{
    public string? X { get; init; }
    public string? Y { get; init; }
}

public sealed record Grid
{
    public required IReadOnlyList<IReadOnlyList<string>> Rows { get; init; }
    public required Origin Origin { get; init; }
    public IReadOnlyList<IReadOnlyList<CellMeta?>?>? CellMeta { get; init; }
    public IReadOnlyList<ChartDescriptor>? Charts { get; init; }
}

public sealed record AnchorDetection
{
    public required IReadOnlySet<int> KeptRows { get; init; }
    public required IReadOnlySet<int> KeptCols { get; init; }
}

public interface IAnchorStrategy
{
    string Name { get; }
    AnchorDetection Detect(Grid grid);
}

public delegate int TokenCounter(string s);

public sealed record CompressOptions
{
    public object? AnchorStrategy { get; init; }
    public TokenCounter? TokenCounter { get; init; }
}

public sealed record Encoding
{
    public required string String { get; init; }
    public required object Json { get; init; }
    public required int TokenEstimate { get; init; }
}

public sealed record EncodingsBundle
{
    public required Encoding Anchor { get; init; }
    public required Encoding InvertedIndex { get; init; }
    public required Encoding FormatAggregation { get; init; }
}

public sealed record TokenBaseline
{
    public required int TokenEstimate { get; init; }
}

public sealed record CompressResult
{
    public required EncodingsBundle Encodings { get; init; }
    public required IReadOnlyList<ChartDescriptor> Charts { get; init; }
    public required TokenBaseline RawBaseline { get; init; }
}

public enum FormatType
{
    IntNum,
    FloatNum,
    ScientificNum,
    PercentageNum,
    CurrencyData,
    DateData,
    TimeData,
    YearData,
    EmailData,
    Boolean,
    Text,
}

public sealed record AnchorCellJson
{
    public required string Address { get; init; }
    public required string Value { get; init; }
}

public sealed record AnchorJson
{
    public string Encoding { get; init; } = "anchor-skeleton";
    public int Version { get; init; } = 0;
    public required Origin Origin { get; init; }
    public required IReadOnlyList<AnchorCellJson> Cells { get; init; }
}

public sealed record InvertedIndexGroupJson
{
    public required string Value { get; init; }
    public required IReadOnlyList<string> Ranges { get; init; }
}

public sealed record InvertedIndexJson
{
    public string Encoding { get; init; } = "inverted-index";
    public int Version { get; init; } = 0;
    public required Origin Origin { get; init; }
    public required IReadOnlyList<InvertedIndexGroupJson> Groups { get; init; }
}

public sealed record FormatAggregationGroupJson
{
    public required FormatType Type { get; init; }
    public required IReadOnlyList<string> Ranges { get; init; }
}

public sealed record FormatAggregationJson
{
    public string Encoding { get; init; } = "format-aggregation";
    public int Version { get; init; } = 0;
    public required Origin Origin { get; init; }
    public required IReadOnlyList<FormatAggregationGroupJson> Groups { get; init; }
}
