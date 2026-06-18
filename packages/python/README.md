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

## The three encodings

The same sparse two-table sheet, in each encoding (`["string"]` shown; each group also has a JSON
form and a `["tokenEstimate"]`). Raw baseline **100 tokens → 80 / 77 / 23**:

```text
# encodings.anchor.string  — addresses + values, empty rows dropped
A1,Product|B1,Q1|C1,Q2|D1,Q3|E1,Q4
A2,Apples|B2,100|C2,150|D2,200|E2,120
A15,Region|B15,Cost|C15,Margin|D15,Profit|E15,Status
A16,North|B16,500|C16,0.15|D16,75|E16,good

# encodings.invertedIndex.string  — value → cell(s); repeats collapse (B4|D18,60)
A1,Product
B4|D18,60
E16|E18,good

# encodings.formatAggregation.string  — values → type over ranges
IntNum: B2:E4,B16:B18,D16:D18
FloatNum: C16:C18
Text: A1:E1,A2:A4,A15:E15,A16:A18,E16:E18
```

See the [project README](https://github.com/mythopoeic/sheet-compressor#what-the-output-looks-like)
for the complete strings.

## Prompts — read the output with an LLM

The shared templates load via `prompts`: reader explainers (`prompts.readers.anchor` /
`.invertedIndex` / `.formatAggregation`), task templates (`prompts.tasks.sheetQA` /
`.cellValueLookup` / `.tableRegionDetection`) with `{ENCODING}` / `{ADDRESS}` / `{QUESTION}`
placeholders, and `prompts.snippets.chartDescriptor`. The library makes **no LLM calls** —
assemble the messages and send them to any chat model. Example with Claude (`pip install anthropic`):

```python
from sheet_compressor import compress, prompts
import anthropic

result = compress(grid)
system = prompts.readers.anchor                  # decoder -> system prompt
user = (
    prompts.tasks.sheetQA                        # task + data -> user message
    .replace("{ENCODING}", result["encodings"]["anchor"]["string"])
    .replace("{QUESTION}", "Which region had the highest profit?")
)

client = anthropic.Anthropic()                   # reads ANTHROPIC_API_KEY
msg = client.messages.create(
    model="claude-opus-4-8",
    max_tokens=1024,
    system=system,
    messages=[{"role": "user", "content": user}],
)
print(msg.content[0].text)
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
