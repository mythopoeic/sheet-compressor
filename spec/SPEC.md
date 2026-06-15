# SheetCompressor — SPEC v0

Language-neutral contract for the `sheet-compressor` library. Every implementation (TypeScript reference, Python, C#, Go, VBA, Office Script) MUST produce byte-identical output for the same input on every fixture in [`fixtures/`](../fixtures).

This is **v0**: the **structural-anchor skeleton** and **format-aggregation** encodings are specified. The anchor-detection strategy used here is the deliberately-naive Phase-1 "keep the full grid" policy. The inverted-index encoding, the smarter anchor strategy, and chart descriptors will be added in later slices — but the input and output **contracts** below already reserve their shape so they can be filled in without breaking changes.

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
    anchor: Encoding;             // implemented in v0 (§3)
    formatAggregation: Encoding;  // implemented in v0 (§4)
    invertedIndex?: Encoding;     // reserved; absent in v0
  };

  // Token estimate for the raw sheet (the un-compressed baseline), so callers
  // can report a compression ratio. v0 uses the documented heuristic counter.
  rawBaseline: { tokenEstimate: number };
};

type Encoding = {
  string: string;                 // canonical string form
  json: unknown;                  // canonical JSON form
  tokenEstimate: number;          // tokens for `string`, via the active counter
};
```

The result object MUST always include `encodings.anchor`, `encodings.formatAggregation`, and `rawBaseline`. Other encoding slots are absent (not `null`) when not yet implemented.

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

## 4. Format-aggregation encoding (v0)

The format-aggregation encoding classifies each non-empty cell into a type category, then merges adjacent same-type cells into rectangular A1 ranges. Large numeric blocks collapse from one token per cell to one token per rectangle, which is where the encoding wins on real sheets.

### 4.1 Type categories

The category set, in canonical emission order:

| Order | Name             | Matches                                                                 |
|-------|------------------|-------------------------------------------------------------------------|
| 1     | `IntNum`         | `^-?\d+$` (and not classified as `YearData` first)                      |
| 2     | `FloatNum`       | `^-?(\d+\.\d*|\.\d+)$` — a decimal point, no exponent                  |
| 3     | `ScientificNum`  | `^-?\d+(\.\d+)?[eE][+-]?\d+$`                                           |
| 4     | `PercentageNum`  | `^-?\d+(\.\d+)?%$`                                                      |
| 5     | `CurrencyData`   | `^-?[$€£¥]\d+(\.\d+)?$`                                                 |
| 6     | `DateData`       | `^\d{4}-\d{1,2}-\d{1,2}$`, `^\d{1,2}/\d{1,2}/\d{2,4}$`, or `^\d{1,2}-\d{1,2}-\d{2,4}$` |
| 7     | `TimeData`       | `^\d{1,2}:\d{2}(:\d{2})?\s?(AM\|PM\|am\|pm)$` or `^\d{1,2}:\d{2}(:\d{2})?$` |
| 8     | `YearData`       | `^(19\|20)\d{2}$` (four-digit year in 1900–2099)                        |
| 9     | `EmailData`      | `^[^\s@]+@[^\s@]+\.[^\s@]+$`                                            |
| 10    | `Boolean`        | case-insensitive `true` or `false`                                      |
| 11    | `Text`           | fallback for any non-empty value that matches nothing above             |

Classification probes patterns in the priority order **Boolean → EmailData → ScientificNum → PercentageNum → CurrencyData → DateData → TimeData → YearData → FloatNum → IntNum → Text**, and the first match wins. The priority order is what makes `1900` a `YearData` (not `IntNum`) and `1.5e10` a `ScientificNum` (not `FloatNum`).

A cell with the empty string `""` has no type and never participates in aggregation (per §3.1).

### 4.2 Aggregation algorithm

Greedy rectangular merging, deterministic and language-neutral. Scan cells in row-major order; for each unclaimed non-empty cell `(r, c)`:

1. Let `t` be its type.
2. Extend right: grow width `w` while `(r, c+w)` has type `t` and is unclaimed.
3. Extend down: grow height `h` while every cell of `(r+h, c..c+w-1)` has type `t` and is unclaimed. If any cell breaks the run, stop — the rectangle does NOT shrink width to accommodate.
4. Mark every cell of `(r..r+h-1, c..c+w-1)` claimed and emit a rectangle `(t, top=r, left=c, bottom=r+h-1, right=c+w-1)`.

Rectangles are discovered in row-major top-left order. Empty cells break runs; the algorithm never merges across a gap.

### 4.3 String form

One line per type group. Within a line, ranges are joined with `,` (no space). Lines are joined with `\n`. There is **no trailing newline**.

```
<Type>: <range>[,<range>]*
```

Type groups are emitted in the canonical order from §4.1 (groups with zero ranges are omitted). Ranges within a group appear in their discovery order — i.e. sorted by `(top-row, left-col)` row-major.

A range is `<top-left>:<bottom-right>` for any multi-cell rectangle, and just `<address>` for a single cell (so `B2`, not `B2:B2`).

**Example.** Applied to the running anchor example:

```
Name  Qty  Price
Apple 3    1.50
(empty row)
Pear  5    0.30
```

produces:

```
IntNum: B2,B4
FloatNum: C2,C4
Text: A1:C1,A2,A4
```

### 4.4 JSON form

```ts
type FormatAggregationJson = {
  encoding: "format-aggregation";
  version: 0;
  origin: { row: number; col: number };
  groups: Array<{ type: FormatType; ranges: string[] }>;
};
```

`groups` is in the same canonical type order as the string form, with the same `ranges` strings. An empty grid emits `groups: []`. JSON formatting matches §3.3: 2-space indent + trailing newline; object key order exactly as in the type above.

## 5. Token counting (v0)

v0 uses one shared **heuristic counter** for both `rawBaseline.tokenEstimate` and each `Encoding.tokenEstimate`. Real tokenizers (tiktoken / gpt-tokenizer / SharpToken / …) will be wired in a later slice via the injectable-counter interface from the PRD; until they land, the heuristic is the only counter and every implementation MUST agree on its output.

**Heuristic** (deterministic, dependency-free):

```
tokens(s) = ceil(length_in_utf16_code_units(s) / 4)
tokens("")    = 0
```

`rawBaseline.tokenEstimate` is computed over the **vanilla encoding** of the grid: every row is joined with ` | ` (space-pipe-space), rows are joined with `\n`, with no escaping and no address prefixes. This is the un-compressed baseline a caller would otherwise paste into a prompt.

For the running example, the vanilla baseline is:

```
Name | Qty | Price
Apple | 3 | 1.50
 |  | 
Pear | 5 | 0.30
```

## 6. Conformance

Every implementation ships a single command (e.g. `npm test` for TypeScript) that:

1. Loads every fixture under `fixtures/corpus/`.
2. Runs `compress()` on the fixture's input.
3. Diffs the produced `string`, `json`, and `tokenEstimate` for each encoding (plus `rawBaseline.tokenEstimate`) against the fixture's goldens.
4. Fails on any byte-level difference.

Goldens are regenerated from the TypeScript reference implementation via a one-step script (see [`fixtures/README.md`](../fixtures/README.md)). Hand-editing goldens is not supported — change `compress()` and regenerate.
