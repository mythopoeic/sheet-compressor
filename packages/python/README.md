# sheet-compressor (Python)

Python port of the SheetCompressor encoding from the SpreadsheetLLM paper. Pure
core with zero required dependencies; conforms to the shared golden corpus in
`fixtures/corpus/`. See [`spec/SPEC.md`](../../spec/SPEC.md) for the
language-neutral contract.

```python
from sheet_compressor import compress

grid = {
    "rows": [
        ["Name", "Qty", "Price"],
        ["Apple", "3", "1.50"],
        ["", "", ""],
        ["Pear", "5", "0.30"],
    ],
    "origin": {"row": 1, "col": 1},
}
result = compress(grid)
print(result["encodings"]["anchor"]["string"])
```

## Real tokenizer (optional)

Install with `pip install sheet-compressor[tokenizer]` and pass a `tiktoken`-backed
counter to `compress`:

```python
from sheet_compressor import compress, create_token_counter

result = compress(grid, {"tokenCounter": create_token_counter()})
```

`create_token_counter` defaults to `o200k_base` (GPT-4o / GPT-5 family); pass
`encoding="cl100k_base"` for the GPT-3.5 / GPT-4 family. It raises a clear error
if `tiktoken` is not installed.

## Conformance

```
python3 -m unittest discover -s tests
```

The conformance suite walks every fixture under `fixtures/corpus/` and asserts
byte-equal output against the goldens — the same shape as the TypeScript
reference's conformance test.
