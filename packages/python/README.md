# sheet-compressor (Python)

Independent Python implementation of the **SheetCompressor** encoding from the
[SpreadsheetLLM paper](https://arxiv.org/abs/2407.09025) (Dong et al., Microsoft, 2024).
Pure core with zero required dependencies; conforms to the shared golden corpus in
`fixtures/corpus/`. See [`spec/SPEC.md`](../../spec/SPEC.md) for the
language-neutral contract.

> Independent, community implementation. Not affiliated with or endorsed by Microsoft.
> Part of the multi-language
> [`sheet-compressor`](https://github.com/mythopoeic/sheet-compressor) project.

## Install

```bash
pip install sheet-compressor                 # core, zero required deps (Python >= 3.9)
pip install "sheet-compressor[tokenizer]"    # + tiktoken-backed token counts
pip install "sheet-compressor[xlsx]"         # + openpyxl .xlsx reader
```

## Usage

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

## Optional .xlsx adapter

Install with `pip install sheet-compressor[xlsx]` and read a workbook into a
Grid via openpyxl:

```python
from sheet_compressor import compress
from sheet_compressor.adapters.xlsx import read_sheet

grid = read_sheet("workbook.xlsx")            # first sheet
grid = read_sheet("workbook.xlsx", {"sheet": "Q3"})  # by name
grid = read_sheet("workbook.xlsx", {"sheet": 1})     # by 0-indexed position
result = compress(grid)
```

`read_sheet` accepts a file path, raw bytes, or any binary file-like object.
It raises a clear `ImportError` if openpyxl is not installed. The pure core
keeps working without it — build the `Grid` yourself and pass it to
`compress()` directly.

## Conformance

```
python3 -m unittest discover -s tests
```

The conformance suite walks every fixture under `fixtures/corpus/` and asserts
byte-equal output against the goldens — the same shape as the TypeScript
reference's conformance test.
