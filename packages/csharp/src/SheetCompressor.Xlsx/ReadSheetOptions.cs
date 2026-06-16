namespace SheetCompressor.Xlsx;

/// <summary>
/// Options for <see cref="XlsxReader.ReadSheet(byte[], ReadSheetOptions?)"/>.
/// <c>SheetName</c> wins over <c>SheetIndex</c> when both are set; both omitted
/// selects the first sheet (SPEC §8.1).
/// </summary>
public sealed record ReadSheetOptions
{
    public string? SheetName { get; init; }
    public int SheetIndex { get; init; } = 0;
}
