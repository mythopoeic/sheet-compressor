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

## The three encodings

The same sparse two-table sheet, in each encoding (`.String` shown; each group also has `.Json`
and `.TokenEstimate`). Raw baseline **100 tokens → 80 / 77 / 23**:

```text
# Encodings.Anchor.String  — addresses + values, empty rows dropped
A1,Product|B1,Q1|C1,Q2|D1,Q3|E1,Q4
A2,Apples|B2,100|C2,150|D2,200|E2,120
A15,Region|B15,Cost|C15,Margin|D15,Profit|E15,Status
A16,North|B16,500|C16,0.15|D16,75|E16,good

# Encodings.InvertedIndex.String  — value → cell(s); repeats collapse (B4|D18,60)
A1,Product
B4|D18,60
E16|E18,good

# Encodings.FormatAggregation.String  — values → type over ranges
IntNum: B2:E4,B16:B18,D16:D18
FloatNum: C16:C18
Text: A1:E1,A2:A4,A15:E15,A16:A18,E16:E18
```

See the [project README](https://github.com/mythopoeic/sheet-compressor#what-the-output-looks-like)
for the complete strings.

## Prompts — read the output with an LLM

The shared prompt templates ship with the package and load via `PromptsLoader.Instance`: reader
explainers (`PromptsLoader.Instance.Readers.Anchor` / `.InvertedIndex` / `.FormatAggregation`)
that teach a model to decode each encoding, task templates
(`PromptsLoader.Instance.Tasks.SheetQA` / `.CellValueLookup` / `.TableRegionDetection`) with
`{ENCODING}` / `{ADDRESS}` / `{QUESTION}` placeholders, and `.Snippets.ChartDescriptor`. The
library makes **no LLM calls** — assemble the messages and send them to any chat model:

```csharp
var result = Compressor.Compress(grid);

// reader explainer → system prompt; task template with placeholders filled → user message
var system = PromptsLoader.Instance.Readers.Anchor;
var user = PromptsLoader.Instance.Tasks.SheetQA
    .Replace("{ENCODING}", result.Encodings.Anchor.String)
    .Replace("{QUESTION}", "Which region had the highest profit?");

// Send { system, user } to your chat model (e.g. the Anthropic .NET SDK) and read the reply.
```

## License

[MIT](https://github.com/mythopoeic/sheet-compressor/blob/main/LICENSE). The SheetCompressor
algorithm originates from the SpreadsheetLLM paper, credited above.
