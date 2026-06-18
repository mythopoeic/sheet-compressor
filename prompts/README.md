# Prompts

Shared prompt-template source. Each language package mirrors these files byte-for-byte and exposes them as constants. See [SPEC §10](../spec/SPEC.md#10-prompt-templates-shared-source) for the contract.

## Layout

```
prompts/
  readers/                  # one explainer per encoding
    anchor.md
    invertedIndex.md
    formatAggregation.md
  tasks/                    # ready-made task templates
    tableRegionDetection.md
    cellValueLookup.md      # uses {ENCODING}, {ADDRESS}, {QUESTION} placeholders
    sheetQA.md              # uses {ENCODING}, {QUESTION} placeholders
  snippets/
    chartDescriptor.md      # how to read CHART(...) tokens
```

## Editing

`prompts/` is the single source of truth. To change a prompt:

1. Edit the file here.
2. Run each port's test suite. The per-package mirror tests assert byte-equality between the package's exposed constants and the file on disk, so drift is caught at test time.

The TypeScript reference loads these files at module init (no regenerate step). Ports that prefer compile-time embedding (Go, C#) re-run their mirror step after a change here.

## Placeholders

Task templates contain `{NAME}` placeholders the caller substitutes before sending to a model. The convention is intentionally simple — a `string.replace("{NAME}", value)` call works in every target language.

| Template | Placeholders |
| --- | --- |
| `tasks/tableRegionDetection.md` | `{ENCODING}` |
| `tasks/cellValueLookup.md` | `{ENCODING}`, `{ADDRESS}`, `{QUESTION}` |
| `tasks/sheetQA.md` | `{ENCODING}`, `{QUESTION}` |

Reader explainers and the chart snippet have no placeholders — they are concatenated as-is.
