# SheetCompressor — SPEC v0

Language-neutral contract for the `sheet-compressor` library. Every implementation (TypeScript reference, Python, C#, Go, VBA, Office Script) MUST produce byte-identical output for the same input on every fixture in [`fixtures/`](../fixtures).

This is **v0**: only the **structural-anchor skeleton** encoding is specified, and the anchor-detection strategy used here is the deliberately-naive Phase-1 "keep the full grid" policy. The inverted-index and format-aggregation encodings, the smarter anchor strategy, and chart descriptors will be added in later slices — but the input and output **contracts** below already reserve their shape so they can be filled in without breaking changes.

## 1. Input contract

A single sheet is described by a `Grid`:

```ts
type Grid = {
  // Row-major cell text. rows[r][c] is a string ("" = empty cell).
  // Rows MAY be ragged; missing trailing cells are treated as "".
  rows: string[][];

  // The A1 address of rows[0][0] in the source sheet (1-indexed, inclusive).
  // origin = { row: 1, col: 1 } means rows[0][0] is A1.
  // origin = { row: 5, col: 3 } means rows[0][0] is C5.
  origin: { row: number; col: number };

  // OPTIONAL parallel-shape metadata. cellMeta[r][c] describes rows[r][c].
  // v0 only reads `dataType`; style flags are reserved for Phase 2.
  cellMeta?: CellMeta[][];

  // OPTIONAL chart descriptors anchored on this sheet.
  // v0 accepts and round-trips them in the input but does not yet emit them
  // into any encoding (reserved slot in the output schema).
  charts?: ChartDescriptor[];
};

type CellMeta = {
  dataType?: "text" | "number" | "date" | "bool" | "formula" | "error" | "empty";
  // Reserved for Phase 2: bold, border, mergeAnchor, numberFormat, ...
};

type ChartDescriptor = {
  name: string;
  type: "bar" | "line" | "pie" | "scatter" | "area" | "other";
  anchorRange: string;            // A1 range, e.g. "B5:F20"
  title?: string;
  dataRanges?: string[];          // A1 ranges
  series?: string[];
  axes?: { x?: string; y?: string };
};
```

### 1.1 Address conventions

- A1 addresses are **1-indexed**.
- Columns use the Excel letter scheme: `A..Z`, `AA..AZ`, `BA..ZZ`, `AAA..`, etc.
- `origin` is the address of the grid's top-left cell. The cell at `rows[r][c]` therefore lives at column `origin.col + c` and row `origin.row + r`.
- A blank `Grid` (`rows: []` or all-empty rows) is valid and produces an empty encoding.

## 2. Output contract

```ts
type CompressResult = {
  encodings: {
    anchor: Encoding;             // implemented in v0
    invertedIndex?: Encoding;     // reserved; absent in v0
    formatAggregation?: Encoding; // reserved; absent in v0
  };

  // Token estimate for the raw sheet (the un-compressed baseline), so callers
  // can report a compression ratio. v0 uses the documented heuristic counter.
  rawBaseline: { tokenEstimate: number };
};

type Encoding = {
  string: string;                 // canonical string form (see §3)
  json: unknown;                  // canonical JSON form (see §3)
  tokenEstimate: number;          // tokens for `string`, via the active counter
};
```

The result object MUST always include `encodings.anchor` and `rawBaseline`. Other encoding slots are absent (not `null`) when not yet implemented.

## 3. Structural-anchor skeleton encoding (v0)

### 3.1 Phase-1 anchor strategy: "keep the full grid"

For v0, anchor detection is intentionally a no-op: **every non-empty cell in the input grid is kept**. The smarter strategy (value-heterogeneity + data-type transitions + k-neighborhood window) lands in a later slice and will replace this policy without changing §3.2 / §3.3.

A cell counts as **empty** iff its string value is exactly `""`. Whitespace-only strings (`" "`, `"\t"`) are NOT empty.

### 3.2 String form

The string form is a sequence of `address,value` tokens.

- One **non-empty cell** per token, formatted as `<A1>,<escaped-value>`.
- Tokens within the same row are joined with `|`.
- Rows are joined with `\n`.
- Fully-empty rows are dropped (not emitted as a blank line).
- The whole encoding has **no trailing newline**.
- Cells are emitted in row-major order: rows top-to-bottom, columns left-to-right.

**Value escaping** (applied to every cell value before it is written):

1. `\` → `\\`
2. `,` → `\,`
3. `|` → `\|`
4. `\n` → `\n` (literal backslash + `n`)
5. `\r` → `\r`
6. `\t` → `\t`

The escapes are applied left-to-right, with rule (1) first so it doesn't double-escape the backslashes the later rules introduce.

**Example.** With `origin = { row: 1, col: 1 }` and

```
rows = [
  ["Name", "Qty",  "Price"],
  ["Apple",  "3",   "1.50"],
  ["",      "",    ""    ],
  ["Pear",   "5",   "0.30"],
]
```

the string form is:

```
A1,Name|B1,Qty|C1,Price
A2,Apple|B2,3|C2,1.50
A4,Pear|B4,5|C4,0.30
```

With `origin = { row: 5, col: 3 }` the same rows produce:

```
C5,Name|D5,Qty|E5,Price
C6,Apple|D6,3|E6,1.50
C8,Pear|D8,5|E8,0.30
```

### 3.3 JSON form

```ts
type AnchorJson = {
  encoding: "anchor-skeleton";
  version: 0;
  origin: { row: number; col: number };
  cells: Array<{ address: string; value: string }>;
};
```

`cells` is emitted in the same row-major order as the string form. Empty cells are omitted. `value` is the **raw, unescaped** cell text.

For the first example above:

```json
{
  "encoding": "anchor-skeleton",
  "version": 0,
  "origin": { "row": 1, "col": 1 },
  "cells": [
    { "address": "A1", "value": "Name" },
    { "address": "B1", "value": "Qty" },
    { "address": "C1", "value": "Price" },
    { "address": "A2", "value": "Apple" },
    { "address": "B2", "value": "3" },
    { "address": "C2", "value": "1.50" },
    { "address": "A4", "value": "Pear" },
    { "address": "B4", "value": "5" },
    { "address": "C4", "value": "0.30" }
  ]
}
```

JSON serialisation in goldens uses **2-space indentation** and a trailing newline; the JSON object key order is exactly as listed in the type above.

## 4. Token counting

Token counting is performed by an **injectable counter**. `compress()` accepts a caller-supplied function

```
TokenCounter = (s: string) => number
```

and applies it to both `rawBaseline.tokenEstimate` and each `Encoding.tokenEstimate`. The counter MUST be deterministic for a given input: every call MUST return the same count for the same string within a run.

**Default (heuristic)** — when no counter is supplied, every implementation MUST fall back to the shared heuristic below. The heuristic is the cross-language conformance baseline: the golden fixtures in `fixtures/corpus/` encode its output, and every port's conformance test diffs against those goldens with NO counter supplied.

```
tokens(s) = ceil(length_in_utf16_code_units(s) / 4)
tokens("")    = 0
```

The heuristic is deterministic and dependency-free so Office Script, VBA, and any other host without a tokenizer can implement it directly.

**Real-tokenizer adapters** — each language package SHOULD additionally expose a factory that returns a `TokenCounter` backed by that ecosystem's real BPE tokenizer (TypeScript: `gpt-tokenizer` / `js-tiktoken`; Python: `tiktoken`; C#: `SharpToken`; Go: `tiktoken-go`). The factory defaults to the `o200k_base` encoding (GPT-4o / GPT-5 family) and is configurable. The underlying tokenizer dependency is OPTIONAL / peer — the core MUST work without it. These adapters are NOT part of the cross-language conformance check; results from a real tokenizer are inherently model-specific and need not agree byte-for-byte across languages.

`rawBaseline.tokenEstimate` is computed over the **vanilla encoding** of the grid: every row is joined with ` | ` (space-pipe-space), rows are joined with `\n`, with no escaping and no address prefixes. This is the un-compressed baseline a caller would otherwise paste into a prompt.

For the running example, the vanilla baseline is:

```
Name | Qty | Price
Apple | 3 | 1.50
 |  | 
Pear | 5 | 0.30
```

## 5. Conformance

Every implementation ships a single command (e.g. `npm test` for TypeScript) that:

1. Loads every fixture under `fixtures/corpus/`.
2. Runs `compress()` on the fixture's input.
3. Diffs the produced `string`, `json`, and `tokenEstimate` for each encoding (plus `rawBaseline.tokenEstimate`) against the fixture's goldens.
4. Fails on any byte-level difference.

Goldens are regenerated from the TypeScript reference implementation via a one-step script (see [`fixtures/README.md`](../fixtures/README.md)). Hand-editing goldens is not supported — change `compress()` and regenerate.
