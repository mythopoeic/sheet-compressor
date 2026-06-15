A `CHART(...)` token in the compressed sheet describes a chart that lives on the source spreadsheet. The chart is not rendered — only its descriptor is included.

## Syntax

```
CHART(<type>)@<anchorRange>[ title="<title>"][ data=<r1>,<r2>,…][ series=[<s1>,<s2>,…]][ xAxis="<label>"][ yAxis="<label>"]
```

Fields, in fixed order:

1. **`<type>`** — one of `bar`, `line`, `pie`, `scatter`, `area`, or `other`.
2. **`<anchorRange>`** — the A1 range on the source sheet where the chart is positioned (the cells it overlays / anchors to), e.g. `B5:F20`. Position, not data.
3. **`title="..."`** *(optional)* — the chart's title, with `\` → `\\`, `"` → `\"`, `\n`, `\r`, `\t` escaped.
4. **`data=<r1>,<r2>,…`** *(optional)* — A1 ranges holding the chart's source data, comma-separated.
5. **`series=[<s1>,<s2>,…]`** *(optional)* — series names inside `[ ]`, comma-separated. Names escape `\`, `,`, `]`, `\n`, `\r`, `\t`.
6. **`xAxis="..."`** / **`yAxis="..."`** *(optional)* — axis labels, same quoted-string escapes as `title`.

Any optional field whose source value is absent (or whose array is empty) is omitted entirely — it is not rendered as an empty value.

## Examples

```
CHART(bar)@B5:F20 title="Sales" data=A1:D10 series=[Q1,Q2]
CHART(pie)@A1:B2
CHART(line)@C3 data=A1:A10,B1:B10 xAxis="Month" yAxis="Revenue"
```

## What you can infer

- **The chart exists** at the given anchor range. If the user asks about a chart, look for `CHART(...)` tokens in the encoding.
- **The data ranges tell you which cells the chart plots.** Cross-reference those ranges against the surrounding encoding to read the underlying numbers.
- **Series names and axis labels** describe the chart's structure but not its values.

## What you cannot infer

- **No pixel data.** The descriptor does not render the chart — do not claim to see colours, exact bar heights, or trends you cannot derive from the underlying cells.
- **No legend / formatting beyond what's declared.** If the descriptor has no `title`, the chart has no recorded title; do not guess one.
