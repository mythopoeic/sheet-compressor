# sheet-compressor — VBA port

A faithful hand-port of the SpreadsheetLLM **SheetCompressor** encoding core into
importable VBA modules, plus Excel host glue and a conformance harness. It
produces **byte-identical** output (string + JSON + token estimate) to the
TypeScript reference in `packages/typescript/` and the shared golden corpus in
`fixtures/corpus/`.

No LLM calls, no provider SDKs — just the compression core and the file/host
adapters around it.

> **Developing this port?** Read
> [`docs/agents/host-port-constraints.md`](../../docs/agents/host-port-constraints.md)
> first — the VBE compiler enforces rules (no public arrays on classes,
> case-insensitive identifiers, declaration order) that no headless check sees.
> It includes pre-flight scanners and the re-import trap.

## What's here

The package is shipped as importable `.bas`/`.cls` source files (no SQL, ribbon,
or forms). Import them into any Excel workbook's VBA project (an `.xlsm` shell is
intentionally out of scope).

### Pure core (no Excel-object dependencies)

These operate only on a `Grid` object (a 2D string array + origin); they touch no
Excel objects and could run in any VBA host.

| Module | Mirrors (TypeScript) | SPEC |
|---|---|---|
| `Grid.cls` | `types.ts` `Grid` | §1 |
| `ChartDescriptor.cls` | `types.ts` `ChartDescriptor` | §1 / §6 |
| `Encoding.cls` | `types.ts` `Encoding` | §2 |
| `CompressResult.cls` | `types.ts` `CompressResult` | §2 |
| `StringBuilder.cls` | (utility) | — |
| `ScAddress.bas` | `address.ts` | §1.1 |
| `ScEscape.bas` | `encodings/escape.ts` + chart escapers | §3.2 / §6.1 |
| `ScTokens.bas` | `tokens.ts` (`estimateTokens`) + `baseline.ts` | §7 |
| `ScStrategy.bas` | `strategies.ts` (`phase1`, `keep-all`) | §3.1 |
| `ScEncodings.bas` | `encodings/anchor.ts`, `invertedIndex.ts`, `chartDescriptors.ts` | §3 / §4 / §6 |
| `ScFormatAgg.bas` | `encodings/formatAggregation.ts` | §5 |
| `ScJson.bas` | `csharp/.../Json/CanonicalJson.cs` | §3.3 / §4.5 / §5.4 / §6.2 |
| `ScCompress.bas` | `compress.ts` | §2 / §6.2 |

### Host glue (Excel-coupled)

| Module | Role |
|---|---|
| `ScHost.bas` | `Worksheet.UsedRange` → `Grid` (origin from the range), `ChartObjects` → `ChartDescriptor`, optional `Chart.Export` → base64, and UTF-8/LF file I/O. The **only** module that references Excel objects. |

### Conformance + JSON parsing

| Module | Role |
|---|---|
| `ScFixtures.bas` | Build a `Grid` from a parsed `input.json` (SPEC §1 shape). |
| `ScHarness.bas` | The conformance macro (SPEC §9): read every fixture, run the core, diff byte-for-byte against goldens, write a PASS/FAIL report. |
| `JsonConverter.bas` | VBA-JSON (Tim Hall, MIT) — used for **parsing** fixture input only. Output JSON is hand-built by `ScJson.bas` to match goldens exactly. |

## Importing into Excel

1. Open Excel, press `Alt`+`F11` to open the VBA editor (VBE).
2. `File` → `Import File…` (`Ctrl`+`M`), then import **every** file under
   `packages/vba/src/`:
   - all `*.cls` class modules, and
   - all `*.bas` standard modules (including `JsonConverter.bas`).

   Order doesn't matter; VBA resolves references at compile time.
3. The modules use only late-bound automation (`Scripting.Dictionary`,
   `VBScript.RegExp`, `ADODB.Stream`, `MSXML2.DOMDocument`) via `CreateObject`,
   so **no `Tools` → `References` setup is required**. (These COM components ship
   with Windows.)
4. Build to check: `Debug` → `Compile VBAProject`. It should compile clean.

> The package files are ASCII + CRLF for clean VBE import. Comments cite the SPEC
> section and the TypeScript function each routine mirrors.

## Compressing a sheet (host usage)

```vba
Sub DemoCompress()
    Dim g As Grid
    Set g = ScHost.GridFromUsedRange(ActiveSheet)   ' origin from UsedRange

    Dim res As CompressResult
    Set res = ScCompress.Compress(g)                 ' default strategy = "phase1"

    Debug.Print res.Anchor.StringForm
    Debug.Print res.Anchor.JsonForm                  ' canonical JSON, trailing \n
    Debug.Print "anchor tokens = " & res.Anchor.TokenEstimate
    Debug.Print "raw baseline tokens = " & res.RawBaselineTokens
End Sub
```

You can also build a `Grid` directly from a 2D array without touching Excel:

```vba
Dim data(0 To 1, 0 To 1) As Variant
data(0, 0) = "Name": data(0, 1) = "Qty"
data(1, 0) = "Apple": data(1, 1) = "3"
Dim g As Grid
Set g = ScCompress.NewGridFromArray(data, 1, 1)   ' origin A1
```

Pass `"keep-all"` as the second argument to `Compress` to disable phase-1 anchor
detection.

## Running the conformance harness

1. Import the modules into a workbook (above). Saving it inside `packages/vba/`
   lets the harness find the corpus with no configuration:
   `DefaultCorpusPath` resolves to `..\..\fixtures\corpus` relative to the
   workbook.
2. In the VBE Immediate window (`Ctrl`+`G`) or via `Run` → `Run Macro`:

   ```vba
   ScHarness.RunConformance
   ```

   or against an explicit corpus path:

   ```vba
   ?ScHarness.RunConformanceAt("C:\path\to\fixtures\corpus")
   ```

3. The macro reads each `fixtures/corpus/<name>/input.json`, runs `Compress`, and
   diffs the produced output **byte-for-byte** against the goldens:
   - `anchor` / `invertedIndex` / `formatAggregation`:
     `*.string.txt`, `*.json`, `*.tokenEstimate.txt`
   - `charts.json`
   - `rawBaseline.tokenEstimate.txt`

## Reading the report

The report is printed to the Immediate window **and** written to
`fixtures/vba-conformance-report.txt` (UTF-8, no BOM). Format:

```
SheetCompressor VBA conformance
corpus: ...\fixtures\corpus
------------------------------------------------------------
PASS  empty
PASS  escapes
FAIL  unicode
        unicode anchor.json: first diff at char 142 produced=U+00E9 'é' golden=U+0065 'e' (lenP=... lenG=...)
...
------------------------------------------------------------
total=14  passed=13  failed=1
RESULT: 1 FAILED
```

- One `PASS`/`FAIL` line per fixture.
- A `FAIL` adds an indented line naming the **first** mismatched artifact and the
  first differing character (with its UTF-16 code unit), plus produced/golden
  lengths — enough to localize a divergence.
- `RESULT: ALL PASS` (with `failed=0` and a non-zero fixture count) is the sign-off
  condition. If you see `NO FIXTURES FOUND`, the corpus path is wrong — pass it
  explicitly to `RunConformanceAt`.

## Notes & caveats

- **Token counting** uses VBA `Len`, which counts UTF-16 code units — matching
  SPEC §7 natively (a non-BMP emoji is two units), so no surrogate conversion is
  needed (unlike the Python/Go ports).
- **JSON output** is hand-built (`ScJson.bas`): 2-space indent, LF endings, fixed
  key order, trailing newline, UTF-8 literal (non-ASCII passes through verbatim,
  never `\uXXXX`). `JsonConverter.ConvertToJson` is **not** used for output.
- **Host glue is best-effort** for charts and cell data types; the conformance
  contract covers only the pure core fed by JSON fixtures, never the host
  adapter (SPEC §8.3).
