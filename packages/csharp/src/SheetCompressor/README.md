# SheetCompressor

Independent C# implementation of the **SheetCompressor** encoding from the
[SpreadsheetLLM paper](https://arxiv.org/abs/2407.09025) (Dong et al., Microsoft, 2024).
Turns a spreadsheet grid into compact, LLM-friendly text — three interchangeable encodings
plus token estimates — and makes **no LLM calls** itself.

> Independent, community implementation. Not affiliated with or endorsed by Microsoft.
> Part of the multi-language
> [`sheet-compressor`](https://github.com/mythopoeic/sheet-compressor) project.

## Install

```bash
dotnet add package SheetCompressor
```

## Usage

```csharp
using SheetCompressor;

var grid = new Grid
{
    Origin = new Origin(1, 1),
    Rows = new IReadOnlyList<string>[]
    {
        new[] { "Name", "Qty", "Price" },
        new[] { "Apple", "3", "1.50" },
    },
};

var result = Compressor.Compress(grid);
Console.WriteLine(result.Encodings.Anchor.String);          // the LLM-ready text
Console.WriteLine($"{result.Encodings.Anchor.TokenEstimate} vs {result.RawBaseline.TokenEstimate}");
```

Each result carries three encodings — `Anchor`, `InvertedIndex`, `FormatAggregation` — every
one with a `.String`, a `.Json`, and a `.TokenEstimate`, plus `RawBaseline` and any `Charts`.
Per-encoding reader prompt templates are available via `PromptsLoader.Instance` and ship with
the package.

For reading `.xlsx` files, add the optional
[`SheetCompressor.Xlsx`](https://www.nuget.org/packages/SheetCompressor.Xlsx) package.

## License

[MIT](https://github.com/mythopoeic/sheet-compressor/blob/main/LICENSE). The SheetCompressor
algorithm originates from the SpreadsheetLLM paper, credited above.
