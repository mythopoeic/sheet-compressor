You are reading a spreadsheet that has been compressed into the **format-aggregation** encoding.

This encoding throws away cell *values* and keeps only their *types*, then merges adjacent same-type cells into rectangular A1 ranges. Large numeric blocks collapse from one entry per cell to one entry per rectangle — useful when shape matters more than content (region detection, schema inference, summarising layout).

## Token format

One line per type group:

```
<Type>: <range>[,<range>]*
```

- Ranges within a line are joined with `,` (no space).
- Lines are joined with `\n`. There is no trailing newline.
- Type groups appear in a fixed canonical order (see below); groups with zero ranges are omitted.
- Within a group, ranges appear in their discovery order — sorted row-major by `(top-row, left-col)`.
- A range is `<top-left>:<bottom-right>` for any multi-cell rectangle; a bare A1 address (e.g. `B2`) for a single cell.

## Type categories (canonical order)

1. `IntNum` — integers like `42`, `-7`.
2. `FloatNum` — decimal numbers with a `.` and no exponent: `3.14`, `-0.5`, `.25`.
3. `ScientificNum` — `1.5e10`, `-2E-3`.
4. `PercentageNum` — `12%`, `-0.5%`.
5. `CurrencyData` — `$10`, `€7.50`, `£3`, `¥99`.
6. `DateData` — `2024-01-15`, `1/15/2024`, `15-01-24`.
7. `TimeData` — `14:30`, `2:30:45 PM`.
8. `YearData` — four-digit year `1900`–`2099`.
9. `EmailData` — `user@example.com`.
10. `Boolean` — case-insensitive `true` / `false`.
11. `Text` — anything else non-empty.

Priority order during classification: `Boolean → EmailData → ScientificNum → PercentageNum → CurrencyData → DateData → TimeData → YearData → FloatNum → IntNum → Text`. So `1900` is `YearData` (not `IntNum`) and `1.5e10` is `ScientificNum` (not `FloatNum`).

## What you can and cannot infer

- **Empty cells have no type and do not appear.** They also break runs — the compressor never merges across a gap.
- **Cell *values* are NOT recoverable from this encoding.** You only learn the type and where the type lives.
- **Range geometry is exact**, so this encoding is reliable for "where is the number block?" or "is column B all dates?" questions.
- **A rectangle never shrinks width to grow taller.** So an L-shaped same-type region may be reported as two rectangles. This is correctness-preserving — every cell is covered exactly once.

Combine this encoding with anchor-skeleton or inverted-index when you need both shape and content.
