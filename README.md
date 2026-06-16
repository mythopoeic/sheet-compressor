# sheet-compressor

Pluggable, multi-language implementations of the **SheetCompressor** encoding from
the [SpreadsheetLLM paper](https://arxiv.org/abs/2407.09025) (Dong et al., Microsoft, 2024).

`sheet-compressor` turns a spreadsheet into a compact, LLM-friendly text representation,
dramatically reducing the token cost of feeding sheets to a language model — without making
any LLM calls itself. Drop it into your own pipeline and pair it with whatever model you like.

> This project implements only the paper's compression component. It is an independent,
> community implementation and is not affiliated with or endorsed by Microsoft.

## What it does

Given a sheet (a grid of cell text, plus optional per-cell types and chart metadata), each
implementation produces three interchangeable encodings — each a different compression
trade-off — as both a raw string and a JSON form, along with token-count estimates:

| Encoding | Wins on |
| --- | --- |
| **Structural-anchor skeleton** | General-purpose default; drops homogeneous filler, keeps table structure |
| **Inverted index** | Sparse / repetitive sheets (value → cell ranges) |
| **Format aggregation** | Large numeric blocks (cell values → type categories over ranges) |

Charts and graphs are emitted as portable text **descriptors** —
`CHART(bar)@B5:F20 title="Sales" data=A1:D10 series=[Q1,Q2]` — in every language. Hosts that
can render (Office Script, desktop Excel via VBA) may additionally attach a base64 image.

## Design

- **Pure core + optional adapters.** The compressor is a pure function over an in-memory
  grid. Each package also ships a thin, optional adapter for its ecosystem's common
  spreadsheet library, so you can pass either your own cell data or an `.xlsx`.
- **One shared spec, one golden corpus.** All implementations are verified against a single
  language-neutral fixture corpus so they produce identical output. See [`spec/`](./spec) and
  [`fixtures/`](./fixtures).
- **Prompt templates included.** Per-encoding "reader" prompts that teach an LLM to decode
  the output, plus task templates (table/region detection, cell-value lookup, sheet Q&A) and
  a snippet for reading `CHART(...)` descriptors. Authored once in [`prompts/`](./prompts) and
  mirrored byte-for-byte into every language package — see [SPEC §9](./spec/SPEC.md#9-prompt-templates-shared-source).

## Languages

| Language | Package | Status |
| --- | --- | --- |
| TypeScript / Node | `sheet-compressor` (npm) | reference implementation; 288 tests |
| Python | `sheet-compressor` (PyPI) → `import sheet_compressor` | implemented; verified vs corpus |
| C# | `SheetCompressor` (NuGet) | implemented; verified vs corpus |
| Go | `github.com/mythopoeic/sheet-compressor/packages/go/...` | implemented; verified vs corpus |
| VBA | importable `.bas` / `.cls` | implemented; verified in-host (Excel desktop) |
| Office Script | `.osts` | implemented; verified in-host (Excel Online) |

> **Pre-release (`v0.0.0`).** The registry names above are reserved but **not yet
> published** to npm / PyPI / NuGet — install those three from source for now
> (clone this repo; each [`packages/<lang>/`](./packages) builds standalone). Go
> installs directly from the public module path, and VBA / Office Script are
> copied from source by design. See **Getting started** below.

## Getting started

Every language follows the same shape: build (or read) a **grid** — rows of cell
text plus a 1-indexed `origin` — call **compress**, then read any encoding's
`.string` (paste into your prompt) and `.tokenEstimate`. Each example below
compresses an in-memory grid and prints the anchor encoding; see each package's
README for the full API (all three encodings, JSON forms, custom strategies, and
real-tokenizer adapters).

### TypeScript / Node — [`packages/typescript`](./packages/typescript)

```bash
npm install sheet-compressor   # (until published: npm install ./packages/typescript)
```
```ts
import { compress } from "sheet-compressor";

const grid = {
  origin: { row: 1, col: 1 },
  rows: [
    ["Name", "Qty", "Price"],
    ["Apple", "3", "1.50"],
  ],
};

const { encodings, rawBaseline } = compress(grid);
console.log(encodings.anchor.string);          // the LLM-ready text
console.log(encodings.anchor.tokenEstimate, "vs", rawBaseline.tokenEstimate);
```
Read an `.xlsx` instead of hand-building the grid (optional `xlsx` dep):
```ts
import { readSheet, compress } from "sheet-compressor";
const result = compress(readSheet("workbook.xlsx"));
```

### Python — [`packages/python`](./packages/python)

```bash
pip install sheet-compressor   # (until published: pip install ./packages/python)
```
```python
from sheet_compressor import compress

grid = {
    "origin": {"row": 1, "col": 1},
    "rows": [
        ["Name", "Qty", "Price"],
        ["Apple", "3", "1.50"],
    ],
}

result = compress(grid)
print(result["encodings"]["anchor"]["string"])
print(result["encodings"]["anchor"]["tokenEstimate"], "vs", result["rawBaseline"]["tokenEstimate"])
```
Read an `.xlsx` (optional `openpyxl` dep):
```python
from sheet_compressor.adapters.xlsx import read_sheet
result = compress(read_sheet("workbook.xlsx"))           # first sheet
result = compress(read_sheet("workbook.xlsx", {"sheet": "Q3"}))
```

### C# — [`packages/csharp`](./packages/csharp)

```bash
dotnet add package SheetCompressor          # core (until published: reference the csproj)
dotnet add package SheetCompressor.Xlsx     # optional .xlsx reader (ClosedXML)
```
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
Console.WriteLine(result.Encodings.Anchor.String);
Console.WriteLine($"{result.Encodings.Anchor.TokenEstimate} vs {result.RawBaseline.TokenEstimate}");
```
Read an `.xlsx` (separate `SheetCompressor.Xlsx` package):
```csharp
using SheetCompressor.Xlsx;
var result = Compressor.Compress(XlsxReader.ReadSheetFile("workbook.xlsx"));
```

### Go — [`packages/go`](./packages/go)

```bash
go get github.com/mythopoeic/sheet-compressor/packages/go/sheetcompressor
```
```go
import "github.com/mythopoeic/sheet-compressor/packages/go/sheetcompressor"

grid := &sheetcompressor.Grid{
    Origin: sheetcompressor.Origin{Row: 1, Col: 1},
    Rows: [][]string{
        {"Name", "Qty", "Price"},
        {"Apple", "3", "1.50"},
    },
}

result := sheetcompressor.Compress(grid, sheetcompressor.Options{})
fmt.Println(result.Anchor.String)
fmt.Println(result.Anchor.TokenEstimate, "vs", result.RawBaseline.TokenEstimate)
```
Read an `.xlsx` (the `xlsx` sub-package; needs build tag `sheetcompressor_excelize` + `github.com/xuri/excelize/v2`):
```go
import "github.com/mythopoeic/sheet-compressor/packages/go/xlsx"
grid, err := xlsx.ReadSheetFile("workbook.xlsx", xlsx.Options{})
```

### Office Script (Excel on the web) — [`packages/officescript`](./packages/officescript)

No package manager — paste and run:

1. Open **Excel on the web → Automate → New Script**.
2. Copy all of [`packages/officescript/src/SheetCompressor.osts`](./packages/officescript/src/SheetCompressor.osts) over the default script and **Run**.

`main(workbook, sheetName?)` reads the target sheet's used range and returns the
three encodings (string + JSON + token estimates), chart descriptors, and
optional base64 chart images. See the package README for the return shape and
paste-into-Automate details.

### VBA (Excel desktop) — [`packages/vba`](./packages/vba)

No package manager — import the modules:

1. `Alt`+`F11` → **File → Import File…**, import every `.bas` / `.cls` from
   [`packages/vba/src/`](./packages/vba/src) (no `Tools → References` needed).
2. `Debug → Compile VBAProject`.

```vba
Sub DemoCompress()
    Dim g As Grid
    Set g = ScHost.GridFromUsedRange(ActiveSheet)   ' read the sheet (origin from UsedRange)

    Dim res As CompressResult
    Set res = ScCompress.Compress(g)                ' default strategy = "phase1"

    Debug.Print res.Anchor.StringForm
    Debug.Print res.Anchor.TokenEstimate, res.RawBaselineTokens
End Sub
```
Or build a grid without touching Excel: `ScCompress.NewGridFromArray(data, 1, 1)`.

> Contributing to the Office Script or VBA ports? Read
> [`docs/agents/host-port-constraints.md`](./docs/agents/host-port-constraints.md) —
> their host compilers are stricter than the local checks.

## License

[MIT](./LICENSE). The SheetCompressor algorithm originates from the SpreadsheetLLM paper,
credited above.
