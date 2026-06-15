# SheetCompressor — SPEC v0

Language-neutral contract for the `sheet-compressor` library. Every implementation (TypeScript reference, Python, C#, Go, VBA, Office Script) MUST produce byte-identical output for the same input on every fixture in [`fixtures/`](../fixtures).

This is **v0**: the **structural-anchor skeleton**, **inverted-index**, and **format-aggregation** encodings are specified. Anchor detection sits behind a swappable strategy interface (§3.1) with two built-ins: the Phase-1 grid-only detector (default) and a `keep-all` fallback. Token counting is performed by an injectable counter (§6) that defaults to a shared cross-language heuristic. Chart descriptors and the Phase-2 styling-aware detector will be added in later slices — but the input and output **contracts** below already reserve their shape so they can be filled in without breaking changes.

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
    invertedIndex: Encoding;      // implemented in v0 (§4)
    formatAggregation: Encoding;  // implemented in v0 (§5)
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

The result object MUST always include `encodings.anchor`, `encodings.invertedIndex`, `encodings.formatAggregation`, and `rawBaseline`.

## 3. Structural-anchor skeleton encoding (v0)

### 3.1 Anchor-detection strategy

Anchor detection is **pluggable**. A strategy is an object that, given a `Grid`, returns the set of row and column indices to keep. The string and JSON forms (§3.2 / §3.3) then emit cells only where both the row and column are kept; the encoding contract is identical regardless of which strategy ran.

```ts
type AnchorDetection = {
  keptRows: ReadonlySet<number>;   // 0-indexed into grid.rows
  keptCols: ReadonlySet<number>;   // 0-indexed
};

type AnchorStrategy = {
  readonly name: string;            // stable identifier, e.g. "phase1"
  detect(grid: Grid): AnchorDetection;
};
```

`compress(grid, options)` selects the strategy from `options.anchorStrategy`, which accepts a built-in name (`"phase1"` | `"keep-all"`) or a custom `AnchorStrategy` object. The **default is `"phase1"`**. Custom strategies are how downstream callers swap in their own detection (or the future Phase-2 styling-aware detector) without changing the public output contract.

A cell counts as **empty** iff its string value is exactly `""`. Whitespace-only strings (`" "`, `"\t"`) are NOT empty.

#### 3.1.1 `keep-all` strategy

The simplest possible policy: every row index `[0, rowCount)` and every column index `[0, maxColCount)` is kept. Use it to opt out of anchor detection entirely or as a conformance reference. Output is identical to the unfiltered row-major skeleton.

#### 3.1.2 `phase1` strategy (default)

Phase-1 is the grid-only detector from the PRD: value heterogeneity + data-type transitions + a k-neighborhood window, followed by a blank-row/column prune pass within the kept region. It uses **only** the grid contents (and `cellMeta.dataType` when present); style flags are reserved for Phase-2.

**Parameters** — fixed in v0 so every language port agrees byte-for-byte:

- `k = 4` — neighborhood half-window radius around each anchor.
- `heterogeneityThreshold = 0.5` — minimum (unique ÷ non-empty) ratio for a row/column to qualify as an anchor on heterogeneity.

**Data-type inference.** For each cell `(r, c)`, the strategy uses `grid.cellMeta?.[r]?.[c]?.dataType` if present. Otherwise it infers from the raw string:

- `""` → `"empty"`
- matches `/^-?\d+(\.\d+)?$/` → `"number"`
- otherwise → `"text"`

The strict decimal regex is deliberately narrow so every language port agrees; richer inference is the host adapter's job (Seam 2 in the PRD), not the core.

**Algorithm.** Let `R = grid.rows.length` and `C = max(row.length for row in grid.rows)`. If either is zero, return empty `keptRows` and `keptCols`.

1. **Heterogeneity anchors.** For each row `r ∈ [0, R)`, compute `H(r) = unique non-empty values ÷ non-empty values` (treat `H(r) = 0` when the row has no non-empty cells). If `H(r) ≥ 0.5`, add `r` to `anchorRows`. Apply the same procedure column-wise to populate `anchorCols`.
2. **Type-transition anchors.** For each adjacent pair of rows `(r-1, r)` with `r ∈ [1, R)`: if there exists any column `c` such that the inferred/declared `dataType` of `(r-1, c)` differs from that of `(r, c)`, add **both** `r-1` and `r` to `anchorRows`. Apply column-wise to `anchorCols`.
3. **K-neighborhood expansion.** Initialise `keptRows = ∅`. For each `a ∈ anchorRows`, add every index in `[max(0, a-k), min(R-1, a+k)]` to `keptRows`. Apply the same to `keptCols` using `anchorCols` and `C`.
4. **Prune blank rows/columns within the kept region.** For each `r ∈ keptRows`: if every cell `(r, c)` with `c ∈ keptCols` is empty, remove `r` from `keptRows`. Then for each `c ∈ keptCols`: if every cell `(r, c)` with `r ∈ (the now-updated) keptRows` is empty, remove `c` from `keptCols`. (Single pass: rows first, then columns.)

The result is the `AnchorDetection` returned to the encoder.

Phase-1 is intentionally lossy on highly homogeneous regions and conservative on sparse layouts; the goal is to keep the "skeleton" of structural landmarks (headers, type-transition boundaries, isolated totals) and drop the homogeneous fill between them. The shared golden corpus is the source of truth — language ports are conformant iff every fixture produces byte-identical output.

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

## 4. Inverted-index encoding (v0)

The inverted-index encoding groups every cell by its raw value and emits the cells that hold each value as a list of A1 ranges. Cells that share a value and form a contiguous rectangle collapse into a single range. This wins big on sparse or highly repetitive sheets, where the anchor skeleton would repeat the same value many times.

### 4.1 Cell selection

The inverted-index input is the same set of non-empty cells the anchor skeleton emits: a cell counts as empty iff its string value is exactly `""`. Whitespace-only strings (`" "`, `"\t"`) are NOT empty and are indexed normally.

### 4.2 Range merging

For each distinct value `v`, the cells holding `v` are collapsed into the minimum-length list of A1 ranges via the following deterministic greedy procedure:

1. Let `S` be the set of (row, col) coordinates of cells with value `v` (absolute, i.e. already offset by `origin`).
2. Iterate cells of `S` in **row-major order** (rows top-to-bottom, columns left-to-right). For each cell `(r, c)` that has not yet been assigned to a range:
   1. Find the maximum **width** `w ≥ 1` such that `(r, c), (r, c+1), …, (r, c+w-1)` are all in `S` and unassigned.
   2. Find the maximum **height** `h ≥ 1` such that for every row `r' ∈ [r, r+h-1]`, the cells `(r', c), (r', c+1), …, (r', c+w-1)` are all in `S` and unassigned.
   3. Emit the rectangle covering rows `[r, r+h-1]` and columns `[c, c+w-1]`, and mark every cell inside it as assigned.

The "maximum height" search is constrained to the width found in step (i): widening the rectangle further down is not attempted. This keeps the algorithm `O(|S|)` per value and produces the same output regardless of language, at the cost of occasionally splitting an L-shaped or T-shaped region into two rectangles instead of one. It is correct (every cell is covered exactly once) and minimal for rectangular regions.

### 4.3 Range syntax

Each emitted rectangle is rendered as an A1 range:

- A single cell is rendered as just its A1 address — `A1`, not `A1:A1`.
- A multi-cell rectangle is rendered as `<top-left>:<bottom-right>` — `A1:C1` for a horizontal run, `A1:A5` for a vertical run, `A1:C5` for a 3×5 rectangle.

### 4.4 String form

The string form is a sequence of value groups. Each group is rendered as:

```
<range1>|<range2>|…|<rangeN>,<escaped-value>
```

- Ranges within a group are joined with `|`, in the order produced by the merging procedure (top-left rectangle first, row-major).
- The list of ranges and the value are separated by a single `,`.
- Groups are joined with `\n`, with **no trailing newline**.
- Groups are ordered by the **first cell address** (row-major) of the value in the grid: the value whose first cell appears earliest comes first.
- Value escaping is identical to the anchor encoding (§3.2 rules 1–6). Range tokens contain only `A-Z`, `0-9`, and `:`, so they never need escaping.
- An all-empty grid produces the empty string.

**Example.** With `origin = { row: 1, col: 1 }` and

```
rows = [
  ["X", "X", "" ],
  ["X", "Y", "Y"],
  ["",  "Y", "" ],
]
```

the string form is:

```
A1:B1|A2,X
B2:C2|B3,Y
```

### 4.5 JSON form

```ts
type InvertedIndexJson = {
  encoding: "inverted-index";
  version: 0;
  origin: { row: number; col: number };
  groups: Array<{ value: string; ranges: string[] }>;
};
```

`groups` is emitted in the same order as the string form (by first cell address). Within each group, `ranges` is in the same order as the string form. `value` is the **raw, unescaped** cell text.

For the example above:

```json
{
  "encoding": "inverted-index",
  "version": 0,
  "origin": { "row": 1, "col": 1 },
  "groups": [
    { "value": "X", "ranges": ["A1:B1", "A2"] },
    { "value": "Y", "ranges": ["B2:C2", "B3"] }
  ]
}
```

JSON serialisation in goldens uses **2-space indentation** and a trailing newline; the JSON object key order is exactly as listed in the type above.

## 5. Format-aggregation encoding (v0)

The format-aggregation encoding classifies each non-empty cell into a type category, then merges adjacent same-type cells into rectangular A1 ranges. Large numeric blocks collapse from one token per cell to one token per rectangle, which is where the encoding wins on real sheets.

### 5.1 Type categories

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

### 5.2 Aggregation algorithm

Greedy rectangular merging, deterministic and language-neutral. Scan cells in row-major order; for each unclaimed non-empty cell `(r, c)`:

1. Let `t` be its type.
2. Extend right: grow width `w` while `(r, c+w)` has type `t` and is unclaimed.
3. Extend down: grow height `h` while every cell of `(r+h, c..c+w-1)` has type `t` and is unclaimed. If any cell breaks the run, stop — the rectangle does NOT shrink width to accommodate.
4. Mark every cell of `(r..r+h-1, c..c+w-1)` claimed and emit a rectangle `(t, top=r, left=c, bottom=r+h-1, right=c+w-1)`.

Rectangles are discovered in row-major top-left order. Empty cells break runs; the algorithm never merges across a gap.

### 5.3 String form

One line per type group. Within a line, ranges are joined with `,` (no space). Lines are joined with `\n`. There is **no trailing newline**.

```
<Type>: <range>[,<range>]*
```

Type groups are emitted in the canonical order from §5.1 (groups with zero ranges are omitted). Ranges within a group appear in their discovery order — i.e. sorted by `(top-row, left-col)` row-major.

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

### 5.4 JSON form

```ts
type FormatAggregationJson = {
  encoding: "format-aggregation";
  version: 0;
  origin: { row: number; col: number };
  groups: Array<{ type: FormatType; ranges: string[] }>;
};
```

`groups` is in the same canonical type order as the string form, with the same `ranges` strings. An empty grid emits `groups: []`. JSON formatting matches §3.3: 2-space indent + trailing newline; object key order exactly as in the type above.

## 6. Token counting

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

**Real-tokenizer adapters** — each language package SHOULD additionally expose a factory that returns a `TokenCounter` backed by that ecosystem's real BPE tokenizer (TypeScript: `gpt-tokenizer` / `js-tiktoken`; Python: `tiktoken`; C#: `SharpToken`; Go: `tiktoken-go`). The factory defaults to the `o200k_base` encoding (GPT-4o / GPT-5 family) and is configurable. The underlying tokenizer dependency is OPTIONAL — the core MUST work without it. These adapters are NOT part of the cross-language conformance check; results from a real tokenizer are inherently model-specific and need not agree byte-for-byte across languages.

`rawBaseline.tokenEstimate` is computed over the **vanilla encoding** of the grid: every row is joined with ` | ` (space-pipe-space), rows are joined with `\n`, with no escaping and no address prefixes. This is the un-compressed baseline a caller would otherwise paste into a prompt.

For the running example, the vanilla baseline is:

```
Name | Qty | Price
Apple | 3 | 1.50
 |  | 
Pear | 5 | 0.30
```

## 7. Conformance

Every implementation ships a single command (e.g. `npm test` for TypeScript) that:

1. Loads every fixture under `fixtures/corpus/`.
2. Runs `compress()` on the fixture's input.
3. Diffs the produced `string`, `json`, and `tokenEstimate` for each encoding (plus `rawBaseline.tokenEstimate`) against the fixture's goldens.
4. Fails on any byte-level difference.

Goldens are regenerated from the TypeScript reference implementation via a one-step script (see [`fixtures/README.md`](../fixtures/README.md)). Hand-editing goldens is not supported — change `compress()` and regenerate.
