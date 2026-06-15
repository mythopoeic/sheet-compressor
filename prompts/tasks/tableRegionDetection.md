Identify the tables and rectangular regions present in the compressed spreadsheet below.

For each table or region you can identify, report:

- **A1 range** — the bounding box, e.g. `B3:E12`.
- **Header row(s)** — which row(s), if any, hold column headers.
- **Header column(s)** — which column(s), if any, hold row labels.
- **Purpose / what it appears to contain** — one short phrase.
- **Confidence** — `high`, `medium`, or `low`.

Use the encoding's structure to guide you:

- A run of `Text` cells across one row followed by typed runs below is a strong column-header signal.
- A column of `Text` cells flanking a rectangular numeric block is a strong row-label signal.
- Multiple disjoint rectangles in different parts of the sheet are usually separate tables.
- A blank ring of unaddressed cells around a region is a strong table-boundary signal.

If the sheet contains no recognisable tables, say so. Do not invent regions that are not supported by the encoding.

## Compressed sheet

```
{ENCODING}
```
