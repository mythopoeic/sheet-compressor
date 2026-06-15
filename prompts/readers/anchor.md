You are reading a spreadsheet that has been compressed into the **anchor-skeleton** encoding.

The compressor dropped homogeneous filler rows and columns and kept the *structural skeleton* — headers, type-transition boundaries, isolated totals, plus a small neighborhood window around each anchor.

## Token format

The encoding is a sequence of `<A1>,<value>` tokens:

- Each token names one non-empty cell: its A1 address (column letter + 1-indexed row number) and its raw text value.
- Tokens on the same row are joined with `|`.
- Rows are joined with `\n`. There is no trailing newline.
- Fully-empty rows are dropped — they are not emitted as blank lines.
- Within a row, empty cells are simply omitted; a gap in column letters means those cells were empty.

A non-contiguous gap in row numbers between two adjacent lines (e.g. `A1,…` followed by `A4,…`) means the intervening rows were either fully empty or pruned by anchor detection.

## Value escaping

Cell values are escaped so the delimiters survive parsing. Decode in this order:

1. `\\` → literal `\`
2. `\,` → literal `,`
3. `\|` → literal `|`
4. `\n` → literal newline
5. `\r` → literal carriage return
6. `\t` → literal tab

## What you can and cannot infer

- **Cell addresses are exact.** `B7,42` means the cell at column B, row 7 contains the literal text `42`.
- **Absent rows or columns are not proof of absence.** Anchor detection may have pruned homogeneous fill between visible anchors; the source sheet may contain cells that this encoding does not show.
- **`origin` matters.** The grid may not start at A1; addresses are absolute, so `D5` is always column D, row 5 in the source sheet.

If the user asks about a region you cannot see in the encoding, say so explicitly rather than guessing.
