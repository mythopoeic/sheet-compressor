# SheetCompressor — SPEC v0

Language-neutral contract for the `sheet-compressor` library. Every implementation (TypeScript reference, Python, C#, Go, VBA, Office Script) MUST produce byte-identical output for the same input on every fixture in [`fixtures/`](../fixtures).

This is **v0**: the **structural-anchor skeleton** and **inverted-index** encodings are specified. Anchor detection sits behind a swappable strategy interface (§3.1) with two built-ins: the Phase-1 grid-only detector (default) and a `keep-all` fallback. The format-aggregation encoding, chart descriptors, and the Phase-2 styling-aware detector will be added in later slices — but the input and output **contracts** below already reserve their shape so they can be filled in without breaking changes.

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
    invertedIndex: Encoding;      // implemented in v0
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

The result object MUST always include `encodings.anchor`, `encodings.invertedIndex`, and `rawBaseline`. Other encoding slots are absent (not `null`) when not yet implemented.

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
