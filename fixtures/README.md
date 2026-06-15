# Fixtures — golden corpus

Language-neutral conformance corpus. Every implementation runs `compress()` over each fixture's input and diffs the output against the goldens here. See [`../spec/SPEC.md`](../spec/SPEC.md) for the contract.

## Layout

```
fixtures/
  corpus/
    <fixture-id>/
      input.json     # the Grid (rows + origin + optional cellMeta + charts)
      meta.json      # human-readable: title + description; used by tooling
      golden/
        anchor.string.txt                  # SPEC §3.2 string form, no trailing newline
        anchor.json                        # SPEC §3.3 JSON form, 2-space indent + trailing newline
        anchor.tokenEstimate.txt           # integer + trailing newline
        invertedIndex.string.txt           # SPEC §4.4 string form, no trailing newline
        invertedIndex.json                 # SPEC §4.5 JSON form, 2-space indent + trailing newline
        invertedIndex.tokenEstimate.txt    # integer + trailing newline
        rawBaseline.tokenEstimate.txt
```

Each golden file is byte-comparable. `anchor.string.txt` deliberately has **no trailing newline** so the file matches `result.encodings.anchor.string` exactly. The `*.tokenEstimate.txt` files each contain one integer followed by a single `\n` so they're sensible in a text editor.

## input.json schema

```json
{
  "rows": [["A", "B"], ["C", "D"]],
  "origin": { "row": 1, "col": 1 },
  "cellMeta": null,
  "charts": null
}
```

`cellMeta` and `charts` MAY be omitted or `null`; v0 ignores them in the output but they are accepted in the input to lock in the contract.

## meta.json schema

```json
{
  "id": "tiny-table",
  "title": "Tiny three-column table",
  "description": "Smoke-test fixture: 3×3 grid with one fully-empty row."
}
```

`id` matches the fixture directory name.

## Regenerating goldens

From `packages/typescript/`:

```
npm run generate-goldens
```

The script reads every `corpus/<id>/input.json`, runs `compress()`, and overwrites the golden files. Hand-editing goldens is not supported — change `compress()` (or the SPEC), then regenerate.

The conformance test (`npm test`) refuses to regenerate; it only diffs. So the regenerate step is an explicit, reviewable action.
