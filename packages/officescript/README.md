# SheetCompressor — Office Script port

Office Script (Excel Automate) implementation of the
[SheetCompressor](../../spec/SPEC.md) encoding.

> **Developing this port?** Read
> [`docs/agents/host-port-constraints.md`](../../docs/agents/host-port-constraints.md)
> first — the Office Scripts compiler is stricter than our local `tsc`, and fixes
> belong in the TS source (never the generated `.osts`).

Office Script **is** TypeScript, so this port does **not** re-implement the
algorithm. A checked-in generator bundles the verified TypeScript reference core
(`packages/typescript/src/`, covered by the 288-test suite) into a single
`namespace SheetCompressorInternal` and emits three `.osts` artifacts. Only the
`main()` host glue and chart extraction are hand-written. Because the core is
byte-derived from the reference, divergence risk is ~zero — and a drift-guard
test enforces it.

## Files

| File | What it is |
| --- | --- |
| `scripts/generate-bundle.ts` | The generator. Reads the core modules in dependency order, strips `import`s, drops the gpt-tokenizer surface from `tokens.ts` (keeping only the SPEC heuristic `estimateTokens`), and concatenates everything into one namespace. Fails loudly on cross-file name collisions. |
| `src/SheetCompressorInternal.generated.osts` | **Generated, drift-guarded.** The core namespace only — byte-identical to the TS reference. Do not edit by hand. |
| `src/SheetCompressor.osts` | **The shippable script.** Minimal `declare namespace ExcelScript` host types + the generated core + hand-written `main(workbook, sheetName?)`. Paste this into Automate. |
| `src/conformance.osts` | **In-host conformance harness.** Embeds every `fixtures/corpus/*` input + golden as inlined literals, runs `compress()` over each, and prints a PASS/FAIL summary. |
| `test/driftguard.test.ts` | Vitest drift guard: re-runs the generator in memory and asserts every committed `.osts` matches byte-for-byte (mirrors the TS `prompts.test.ts` pattern). |

## Usage — paste into Excel Automate

1. In Excel (Online or desktop), open **Automate → New Script**.
2. Open `src/SheetCompressor.osts`, copy its entire contents, and paste over the
   editor's default script.
3. Run. `main` reads the target sheet's used range, extracts chart descriptors,
   and returns:

   ```ts
   {
     sheetName: string;
     origin: { row: number; col: number };   // 1-indexed A1 of the used range's top-left
     encodings: {
       anchor:            { string; json; tokenEstimate };
       invertedIndex:     { string; json; tokenEstimate };
       formatAggregation: { string; json; tokenEstimate };
     };
     charts: ChartDescriptor[];               // echo of the extracted charts
     rawBaseline: { tokenEstimate: number };  // un-compressed baseline tokens
     images: { name; base64 }[];              // empty unless includeImage = true
   }
   ```

   - `main(workbook)` runs on the **active** sheet. Pass a sheet name —
     `main(workbook, "Sheet1")` — to target a specific one.
   - The `json` fields are pretty-printed (2-space) strings with a trailing
     newline, matching the golden format.
   - When wired into **Power Automate**, this return object is the flow's output.

### Charts

Chart descriptors come from `sheet.getCharts()` metadata, mapped to the SPEC's
six `type` buckets (`bar`/`line`/`pie`/`scatter`/`area`/`other`). All host
accessors are defensive (try/catch), so a quirky chart yields a partial
descriptor rather than aborting the run. The optional base64 render
(`chart.getImage()`) is **off by default** — it is not part of the SPEC
`ChartDescriptor` and would bloat the prompt. Call `main(workbook, sheet, true)`
to also receive base64 images in the `images` field.

> **Host-verification note:** `anchorRange` is left empty because the ExcelScript
> `Chart` surface does not expose a clean anchor address. The SPEC treats
> `anchorRange` as opaque, so it renders as `CHART(type)@`. If a future host
> exposes the anchor, fill it in `extractCharts()` (in the generator's
> `mainGlue()`).

The returned `encodings` object carries all three encodings — `anchor`, `invertedIndex`,
`formatAggregation` — each with a `string`, a `json`, and a `tokenEstimate`. See the
[project README](https://github.com/mythopoeic/sheet-compressor#what-the-output-looks-like) for
side-by-side examples of what each string looks like.

## Reading the output with an LLM

This port produces the encodings in-host; the Office Scripts sandbox can't read repo files, so it
does **not** bundle the reader/task prompt templates. To feed the output to a model:

1. Take the encoding you want from the return object — e.g. `encodings.anchor.string`.
2. Pair it with the shared templates in [`prompts/`](../../prompts): the reader explainer for that
   encoding (`readers/anchor.md`, `readers/invertedIndex.md`, `readers/formatAggregation.md`) as
   the **system** prompt, and a task template (`tasks/sheetQA.md`, `tasks/cellValueLookup.md`,
   `tasks/tableRegionDetection.md`) as the **user** message — fill the `{ENCODING}` / `{ADDRESS}` /
   `{QUESTION}` placeholders.
3. Send it to your model. Office Scripts can't call external APIs from the sandbox, so wire the
   script into **Power Automate**: `main`'s return object becomes the flow input, where you build
   the prompt and call an LLM connector (an HTTP action, Azure OpenAI, etc.). For a quick manual
   check, copy a `.string` out and paste it under the reader + task templates in any chat model.

The TypeScript port ships these templates as constants with a runnable end-to-end example — see
the [project README](https://github.com/mythopoeic/sheet-compressor#reading-the-output-with-an-llm).

## Run the conformance harness in Excel Online (sign-off gate)

The sandbox can't read repo files, so the harness embeds the corpus.

1. Automate → New Script → paste the entire contents of `src/conformance.osts`.
2. Run. It needs no workbook data. Read the **output log**:

   ```
   === SheetCompressor conformance ===
   PASS 14 / 14 fixtures
   All fixtures byte-identical to goldens.
   ```

3. Paste that summary onto issue #18 to sign off. On any mismatch it prints the
   failing fixture id, field, and the first diff.

## Drift guard + regenerate (local)

```sh
cd packages/officescript
npm install

npm run generate     # regenerate all three .osts from the TS source + corpus
npm test             # drift guard: committed .osts must match a fresh regen
npm run typecheck    # tsc over each .osts in isolation, with NO node libs
```

If `npm test` fails after you change the TS reference core or a fixture, that's
drift — run `npm run generate` and commit the updated `.osts`.

### How typechecking works

The shippable and conformance scripts are *scripts* (script-scope `main`, a
`declare namespace ExcelScript` block) and share a global scope, so they can't
be compiled together. `scripts/typecheck.ts` copies each `.osts` into its own
isolated temp dir (under `.build/`, gitignored) as a `.ts` file, supplies a
minimal `console` host-global declaration, and runs `tsc` against a node-free
config — proving the bundle type-checks as plain ExcelScript.
