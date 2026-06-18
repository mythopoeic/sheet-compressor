# sheet-compressor (TypeScript)

Independent TypeScript implementation of the **SheetCompressor** encoding from the
[SpreadsheetLLM paper](https://arxiv.org/abs/2407.09025) (Dong et al., Microsoft, 2024).
It turns a spreadsheet into a compact, LLM-friendly text representation — three
interchangeable encodings plus token estimates — and makes **no LLM calls** itself.

> Independent, community implementation. Not affiliated with or endorsed by Microsoft.
> This is the TypeScript package of the multi-language
> [`sheet-compressor`](https://github.com/mythopoeic/sheet-compressor) project.

## Install

```bash
npm install sheet-compressor
```

Requires Node ≥ 20.11. The package is ESM-only and ships compiled JS + `.d.ts`.

## Usage

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

Each `compress()` result carries three encodings — `anchor`, `invertedIndex`,
`formatAggregation` — every one with a `.string`, a `.json`, and a `.tokenEstimate`,
plus `rawBaseline` and any `charts`.

Read an `.xlsx` instead of hand-building the grid (optional `xlsx` peer):

```ts
import { readSheet, compress } from "sheet-compressor";
const result = compress(readSheet("workbook.xlsx"));
```

Decoder/reader prompt templates for each encoding ship under `prompts/` in the package.

## License

[MIT](./LICENSE). The SheetCompressor algorithm originates from the SpreadsheetLLM paper,
credited above. See the [project README](https://github.com/mythopoeic/sheet-compressor)
for the spec, the other language ports, and the shared conformance corpus.
