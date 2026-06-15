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
| TypeScript / Node | `sheet-compressor` (npm) | reference implementation |
| Python | `sheet_compressor` (PyPI) | planned |
| C# | `SheetCompressor` (NuGet) | planned |
| Go | `.../sheetcompressor` | planned |
| VBA | importable `.bas` / `.cls` | planned |
| Office Script | `.osts` | planned |

## License

[MIT](./LICENSE). The SheetCompressor algorithm originates from the SpreadsheetLLM paper,
credited above.
