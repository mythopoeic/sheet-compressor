Answer the cell-value lookup question below using only the compressed spreadsheet.

Rules:

- Return the **raw text value** of the requested cell, exactly as it appears in the encoding (after decoding the escapes).
- If the requested address is not present in the encoding, the cell is either empty in the source sheet OR was dropped by anchor detection. State which is more likely given the surrounding context, and answer `EMPTY` only if you are confident the cell is blank.
- Quote the encoding line(s) you used to derive the answer.
- Do not infer values from neighbouring cells unless the user explicitly asks for an extrapolation.

## Compressed sheet

```
{ENCODING}
```

## Question

Cell to look up: **{ADDRESS}**

(Optional follow-up: {QUESTION})
