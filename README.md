# sheet-compressor

Pluggable, multi-language implementations of the **SheetCompressor** encoding from
the [SpreadsheetLLM paper](https://arxiv.org/abs/2407.09025) (Dong et al., Microsoft, 2024).

`sheet-compressor` turns a spreadsheet into a compact, LLM-friendly text representation,
dramatically reducing the token cost of feeding sheets to a language model — without making
any LLM calls itself. Drop it into your own pipeline and pair it with whatever model you like.

> This project implements only the paper's compression component. It is an independent,
> community implementation and is not affiliated with or endorsed by Microsoft.

## What the output looks like

`compress()` rewrites a sheet as compact, address-anchored text — no LLM calls. Take a sparse
two-table sheet (two 4-row tables separated by ten empty rows). Here is that **same sheet** in
each of the three encodings.

**Structural-anchor skeleton** — `<A1>,<value>` tokens; fully-empty rows vanish and every value
keeps its exact `A1`-style address. The general-purpose default.

```text
A1,Product|B1,Q1|C1,Q2|D1,Q3|E1,Q4
A2,Apples|B2,100|C2,150|D2,200|E2,120
A3,Pears|B3,80|C3,90|D3,110|E3,85
A15,Region|B15,Cost|C15,Margin|D15,Profit|E15,Status
A16,North|B16,500|C16,0.15|D16,75|E16,good
A17,South|B17,400|C17,0.10|D17,40|E17,ok
A18,East|B18,300|C18,0.20|D18,60|E18,good
```

**Inverted index** — one line per distinct value, listing the cell(s) that hold it; repeated
values collapse to a single line. Wins on sparse / repetitive sheets.

```text
A1,Product
B1,Q1
…
A4,Plums
B4|D18,60
C4,70
D4|D16,75
…
E16|E18,good
…
```

(Excerpt — the full output lists every distinct value. `B4|D18,60` means the value `60` appears
in **both** B4 and D18; that sharing is where the savings come from.)

**Format aggregation** — values are replaced by their *type* (`IntNum`, `FloatNum`, `Text`, …)
over address ranges. Collapses large numeric blocks the hardest.

```text
IntNum: B2:E4,B16:B18,D16:D18
FloatNum: C16:C18
Text: A1:E1,A2:A4,A15:E15,A16:A18,E16:E18
```

That 20-row sheet goes from **100 raw tokens → 80 (anchor) / 77 (inverted) / 23 (format)**, and
the gains scale with sheet size. On the bundled 576 × 23 sparse ledger ([`examples/`](./examples))
a single `compress()` call produces:

| encoding | tokens | vs. raw baseline (10,110) |
| --- | --- | --- |
| structural-anchor skeleton | 807 | **12.5× smaller** |
| inverted index | 456 | **22.2× smaller** |
| format aggregation | 160 | **63.2× smaller** |

Each encoding carries a `.string` (shown above), an equivalent `.json` form, and a
`.tokenEstimate`. (Numbers are reproducible from the committed fixtures and example — see
[`fixtures/`](./fixtures) and [`examples/`](./examples).)

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
  mirrored byte-for-byte into every language package — see [SPEC §10](./spec/SPEC.md#10-prompt-templates-shared-source).

## Reading the output with an LLM

The compressed string is meant to go *into a prompt*. Each package ships matching prompt
templates so a model can decode the encoding and answer questions about the sheet:

- **Reader explainers** (`prompts/readers/`) — one per encoding (`anchor`, `invertedIndex`,
  `formatAggregation`). Each teaches the model the token format, the escaping rules, and —
  crucially — that pruned/absent cells are **not** proof of absence. Use as the **system** prompt.
- **Task templates** (`prompts/tasks/`) — `sheetQA` (`{ENCODING}`, `{QUESTION}`), `cellValueLookup`
  (`{ENCODING}`, `{ADDRESS}`, `{QUESTION}`), `tableRegionDetection` (`{ENCODING}`). Fill the
  placeholders with `string.replace` and send as the **user** message.
- **Chart snippet** (`prompts/snippets/chartDescriptor.md`) — how to read `CHART(...)` tokens.

The library makes **no LLM calls** — you assemble the messages and send them to whatever chat
model you like. This example pairs the anchor reader with the `sheetQA` task and calls Claude
(any chat model works — the prompts contain nothing provider-specific):

```ts
import { compress, prompts } from "sheet-compressor";
import Anthropic from "@anthropic-ai/sdk";

const { encodings } = compress(grid);

// reader explainer → system (teaches the model to decode the encoding)
// task template with placeholders filled → user message (the data + the question)
const system = prompts.readers.anchor;
const user = prompts.tasks.sheetQA
  .replace("{ENCODING}", encodings.anchor.string)
  .replace("{QUESTION}", "Which region had the highest profit?");

const client = new Anthropic(); // reads ANTHROPIC_API_KEY
const res = await client.messages.create({
  model: "claude-opus-4-8",
  max_tokens: 1024,
  system,
  messages: [{ role: "user", content: user }],
});
console.log(res.content.find((b) => b.type === "text")?.text);
```

Use the reader that matches the encoding you sent (`prompts.readers.invertedIndex` for the
inverted index, and so on). Per-language prompt accessors are in each package's README. The Go
port does not embed the templates — read them from [`prompts/`](./prompts) directly.

## Languages

| Language | Package | Status |
| --- | --- | --- |
| TypeScript / Node | `sheet-compressor` (npm) | **published** · reference implementation; 288 tests |
| Python | `sheet-compressor` (PyPI) → `import sheet_compressor` | **published** · verified vs corpus |
| C# | `SheetCompressor` (NuGet) | **published** · verified vs corpus |
| Go | `github.com/mythopoeic/sheet-compressor/packages/go/...` | **tagged `v0.1.1`** · verified vs corpus |
| VBA | importable `.bas` / `.cls` | implemented; verified in-host (Excel desktop) |
| Office Script | `.osts` | implemented; verified in-host (Excel Online) |

> **[`v0.1.1`](https://github.com/mythopoeic/sheet-compressor/releases/tag/v0.1.1).**
> **TypeScript (npm), Python (PyPI), C# (NuGet), and Go are published** — install them
> directly (see below). VBA / Office Script are copied from source by design. See
> **Getting started** below.

## Getting started

Every language follows the same shape: build (or read) a **grid** — rows of cell
text plus a 1-indexed `origin` — call **compress**, then read any encoding's
`.string` (paste into your prompt) and `.tokenEstimate`. Each example below
compresses an in-memory grid and prints the anchor encoding; see each package's
README for the full API (all three encodings, JSON forms, custom strategies, and
real-tokenizer adapters).

### TypeScript / Node — [`packages/typescript`](./packages/typescript)

```bash
npm install sheet-compressor
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
pip install sheet-compressor
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
dotnet add package SheetCompressor          # core
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
go get github.com/mythopoeic/sheet-compressor/packages/go/sheetcompressor@v0.1.1
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
