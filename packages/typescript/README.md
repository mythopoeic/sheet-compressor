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

## The three encodings

The same sparse two-table sheet, in each encoding (`.string` shown; each also has `.json` and
`.tokenEstimate`). Raw baseline **100 tokens → 80 / 77 / 23**:

```text
# encodings.anchor.string  — addresses + values, empty rows dropped
A1,Product|B1,Q1|C1,Q2|D1,Q3|E1,Q4
A2,Apples|B2,100|C2,150|D2,200|E2,120
A15,Region|B15,Cost|C15,Margin|D15,Profit|E15,Status
A16,North|B16,500|C16,0.15|D16,75|E16,good

# encodings.invertedIndex.string  — value → cell(s); repeats collapse (B4|D18,60)
A1,Product
B4|D18,60
E16|E18,good

# encodings.formatAggregation.string  — values → type over ranges
IntNum: B2:E4,B16:B18,D16:D18
FloatNum: C16:C18
Text: A1:E1,A2:A4,A15:E15,A16:A18,E16:E18
```

(Anchor and format are shown in full for the small tables; the others are excerpts. See the
[project README](https://github.com/mythopoeic/sheet-compressor#what-the-output-looks-like) for
the complete strings.)

## Prompts — read the output with an LLM

The shared prompt templates ship as constants on `prompts`: reader explainers
(`prompts.readers.anchor` / `.invertedIndex` / `.formatAggregation`) that teach a model to decode
each encoding, task templates (`prompts.tasks.sheetQA` / `.cellValueLookup` /
`.tableRegionDetection`) with `{ENCODING}` / `{ADDRESS}` / `{QUESTION}` placeholders, and
`prompts.snippets.chartDescriptor`. The library makes **no LLM calls** — assemble the messages
and send them to any chat model. Example with Claude (`npm install @anthropic-ai/sdk`):

```ts
import { compress, prompts } from "sheet-compressor";
import Anthropic from "@anthropic-ai/sdk";

const { encodings } = compress(grid);
const system = prompts.readers.anchor;            // decoder → system prompt
const user = prompts.tasks.sheetQA                // task + data → user message
  .replace("{ENCODING}", encodings.anchor.string)
  .replace("{QUESTION}", "Which region had the highest profit?");

const client = new Anthropic();                   // reads ANTHROPIC_API_KEY
const res = await client.messages.create({
  model: "claude-opus-4-8",
  max_tokens: 1024,
  system,
  messages: [{ role: "user", content: user }],
});
console.log(res.content.find((b) => b.type === "text")?.text);
```

Match the reader to the encoding you send (`prompts.readers.invertedIndex` for the inverted
index, etc.).

## License

[MIT](./LICENSE). The SheetCompressor algorithm originates from the SpreadsheetLLM paper,
credited above. See the [project README](https://github.com/mythopoeic/sheet-compressor)
for the spec, the other language ports, and the shared conformance corpus.
