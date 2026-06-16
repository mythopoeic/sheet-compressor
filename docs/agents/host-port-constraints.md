# Host-port constraints: Office Script & VBA

Hard-won rules for the two ports whose target host is **stricter than the
language they look like**. The Office Script `.osts` runs on the Excel Online
in-browser compiler; the VBA `.bas`/`.cls` run in the desktop Excel VBE. Both
have a **human-run, in-host conformance gate** (paste/import → run → paste
`PASS 14/14`).

> **Why this doc exists.** Our local checks do **not** see the host. The Office
> Script `tsc`/typecheck uses our own `tsconfig`, and the VBA port is verified
> against a Node *mirror* — neither replicates the host compiler. Every rule
> below was discovered only when a human compiled/ran the artifact in Excel.
> Treat these as a pre-flight checklist before handing a port to the HITL gate.

---

## Office Script (`packages/officescript`)

### The golden rule: fix the TypeScript source, not the `.osts`

The shippable `.osts` files are **generated** from the verified TS reference
core (`packages/typescript/src/`) by `scripts/generate-bundle.ts`, and a
**drift-guard test** asserts they stay byte-identical to that source. So:

- **Never hand-edit `src/*.osts`** — regeneration clobbers it and the drift
  guard fails. Make the change in `packages/typescript/src/`, then
  `npm run generate`.
- A construct that is illegal in Office Scripts must therefore be avoided in the
  **shared TS core**. Keep the rewrite behavior-preserving so the TS 288-test
  suite still passes.

### Constraints the Office Scripts compiler enforces (that `tsc` does not)

1. **Array-method callbacks must be arrow functions.** No point-free callbacks.
   - ✗ `arr.map(escapeSeriesName)` · `charts.map(renderChartToken)`
   - ✓ `arr.map((s) => escapeSeriesName(s))`
   - Symptom: `Only arrow functions may be used in array method callbacks.`

2. **No `Map`/`Set` iteration that needs `--downlevelIteration`.** Don't
   `for…of` a `Map`/`Set`, and don't spread `[...someSet]`.
   - ✗ `for (const [k, v] of myMap)` · `for (const x of [...mySet])`
   - ✓ `for (const [k, v] of Array.from(myMap))` · `for (const x of Array.from(mySet))`
   - (`Array.from(set)` has the same snapshot semantics as `[...set]`, so it is
     safe even when the loop body mutates the set.)
   - Symptom: `Type 'Map<…>' is not an array type or a string type. Use compiler
     option '--downlevelIteration' …`

3. **No `console.log` inside a loop.** It's a *performance hint* (yellow, not a
   hard error), but the in-host conformance harness should read clean. Collect
   into an array and log once after the loop.
   - Symptom: `Invoking console.log inside of a loop could lead to slow
     performance of the script.`

4. **Keep the generated core ExcelScript-pure.** No `import`s, no Node globals,
   no `ExcelScript` calls in the core namespace — host glue (`main`) is separate
   and hand-written.

### Pre-flight before the HITL paste

```bash
cd packages/officescript
# edit packages/typescript/src/… first, then:
npm run generate          # rebuild the three .osts
npm run typecheck         # script-scope + node tooling
npm test                  # drift guard (bundle == TS source)

# grep the regenerated bundle for the two hard-error classes (should be empty):
grep -nE '\.(map|filter|forEach|reduce|some|every|find|sort|flatMap)\([A-Za-z_$][A-Za-z0-9_$.]*\)' src/*.osts
grep -nE 'of \[\.\.\.|for \(const .* of [A-Za-z].*\b(Map|Set)\b' src/*.osts
```

The authoritative gate is still a human running `src/conformance.osts` in Excel
Online → `PASS 14 / 14`.

---

## VBA (`packages/vba`)

Importable `.bas`/`.cls`, verified in **desktop** Excel (VBA does not run in
Excel on the web). Flow: `Alt`+`F11` → import → `Debug → Compile VBAProject` →
`ScHarness.RunConformance` → `RESULT: ALL PASS`. **There is no headless VBA
compiler in CI / AFK**, so the rules below are caught only in-host — run the
static scanners (below) before handing off.

### Constraints the VBE compiler enforces

1. **No `Public` arrays / fixed-length strings / UDTs / `Declare`s as members of
   a class (object) module.**
   - Fix pattern (used for `Grid`): back the data with a **`Private` array**
     (`mFoo()`), expose element access via a **parametrised `Property Get`/`Let`
     of the same public name** (so `obj.Foo(i, j)` read/write call sites compile
     unchanged), and move (re)allocation into a `RedimFoo` sub (you cannot
     `ReDim obj.member` from outside). Qualify internal reads with `Me.` to avoid
     clashing with Excel globals (e.g. `Cells`).
   - Symptom: `Constants, fixed-length strings, arrays, user-defined types and
     Declare statements not allowed as Public members of object modules`.

2. **Identifiers are case-insensitive.** `R` and `r` are the *same* name —
   declaring both is a duplicate (and would silently alias if it compiled).
   - Convention in this codebase: **counts = `nR`/`nC`/`nRows`/`nCols`, loop
     indices = `r`/`c`**. Never `Dim R` + `Dim r`, and never a param `C` with a
     local `Dim c`.
   - Symptom: `Duplicate declaration in current scope`.

3. **All module-level declarations must precede every procedure.** A
   `Private mFoo As …` / `Const` / `Type` / `Enum` after an `End Sub`/`End
   Function`/`End Property` is illegal — put the whole declaration block under
   `Option Explicit` at the top.
   - Symptom: `Only comments may appear after End Sub, End Function, or End
     Property`.

4. **`Exit` must match its enclosing procedure** — `Exit Function` in a
   `Function`, not `Exit Sub`.

5. **File encoding: ASCII + CRLF.** The modules import cleanly into the VBE only
   as ASCII with CRLF line terminators. When editing with non-VBE tooling,
   preserve CRLF (Python text-mode I/O silently converts to LF — read/write
   binary or re-apply CRLF afterward).

6. **No project references needed.** COM deps (`Scripting.Dictionary`,
   `VBScript.RegExp`, `ADODB.Stream`, `MSXML2.DOMDocument`) are late-bound via
   `CreateObject`, so don't add `Tools → References`.

### The VBE re-import trap (operational, bites every iteration)

Importing a `.bas`/`.cls` whose module name already exists does **not**
overwrite it — the VBE imports a **duplicate** (`ScFoo1`) and keeps compiling
the **old** `ScFoo`. After changing modules, either remove each old module
first, or — far safer — **import all modules once into a fresh blank `.xlsm`**.
A digit-suffixed module name (`Grid1`, `ScCompress1`) is the tell-tale.

### Pre-flight scanners (no VBA host required)

VBA's systematic compile-error classes are statically detectable. Run these over
`packages/vba/src/*.bas` and `*.cls` before the HITL import; each maps to a rule
above:

- **Public array/UDT/fixed-string members in classes** (rule 1):
  `grep -nE 'Public +[A-Za-z_][A-Za-z0-9_]*\([^)]*\) +As' packages/vba/src/*.cls`
- **Case-insensitive duplicate declarations** (rule 2): per-procedure, collect
  `Dim`/`Static`/`Const`/param names, lowercase, flag collisions. (Watch for
  false positives in mutually-exclusive `#If VBA7 … #Else … #End If` branches,
  e.g. `JsonConverter`.)
- **Module-level declarations after a procedure** (rule 3): track in/out of
  `Sub`/`Function`/`Property`; flag any `Public|Private|Dim|Static|Const|Type|
  Enum|Declare` (not a proc header) seen after the first procedure.
- **Mismatched `Exit`** (rule 4): flag `Exit Sub/Function/Property` whose keyword
  ≠ the enclosing procedure kind.

These catch the *systematic* offenders; the human VBE compile + `ScHarness.
RunConformance` remains the authoritative sign-off.

---

## Shared principle

The local toolchain proves the **algorithm** (TS suite, Node mirror, drift
guard); only the **in-host run** proves **host compatibility**. When a host run
surfaces an error, fix it at the correct layer — for Office Script that's the
**TS reference source** (never the generated `.osts`); for VBA it's the offending
`.bas`/`.cls` — re-verify the algorithm locally, then re-run the in-host gate.
