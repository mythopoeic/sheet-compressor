You are reading a spreadsheet that has been compressed into the **inverted-index** encoding.

This encoding flips the usual cell→value relationship: it groups cells by their value, then lists the cells holding each value as a compact set of A1 ranges. Sparse or highly repetitive sheets compress dramatically here.

## Token format

The encoding is one group per line:

```
<range1>|<range2>|…|<rangeN>,<escaped-value>
```

- Each group represents one distinct cell value `<escaped-value>` and the cells that hold it.
- Ranges within a group are joined with `|`, in row-major order (top-left first).
- The list of ranges and the value are separated by a single `,`.
- Groups are joined with `\n`. There is no trailing newline.
- Groups are ordered by the first cell address (row-major) of each value.

### Range syntax

- A single cell is written bare: `A1` (never `A1:A1`).
- A multi-cell rectangle is `<top-left>:<bottom-right>`: `A1:C1` for a horizontal run, `A1:A5` for a vertical one, `A1:C5` for a rectangle.
- Range tokens contain only `A`–`Z`, `0`–`9`, and `:` — they never need escaping.

### Value escaping

The value uses the same escapes as the anchor encoding. Decode left-to-right:

1. `\\` → literal `\`
2. `\,` → literal `,`
3. `\|` → literal `|`
4. `\n` → newline, `\r` → carriage return, `\t` → tab

## What you can and cannot infer

- **A cell appears at most once across all groups.** Each cell holds exactly one value.
- **Disjoint rectangles for the same value mean the cells were not contiguous** — the compressor produces minimum-length lists but never merges across gaps.
- **Cells not listed in any group are empty** in the source sheet (the empty string `""`). Whitespace-only cells (e.g. `" "`) are indexed normally and DO appear.
- **An empty encoding string** means the sheet has no non-empty cells.

When answering questions, prefer to cite ranges (`B2:B10`) rather than enumerating each cell.
