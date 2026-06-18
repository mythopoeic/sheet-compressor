import { defineConfig } from "tsup";

// The core source imports with explicit `.ts` specifiers (allowImportingTsExtensions),
// so plain `tsc` cannot emit runnable JS — esbuild (via tsup) resolves and bundles
// those specifiers into a single ESM entry, and emits matching `.d.ts`.
//
// ESM-only is deliberate: `src/prompts.ts` reads the markdown prompts via
// `import.meta.dirname` (`<dist>/../prompts`), which a CJS shim would break.
export default defineConfig({
  entry: { index: "src/index.ts" },
  format: ["esm"],
  dts: true,
  clean: true,
  // Keep stdout clean: `prepack` runs this build, and `npm pack --json` (used by
  // the issue #19 conformance test and any tooling) must emit pure JSON on stdout.
  silent: true,
  sourcemap: false,
  target: "node20",
  // Optional ecosystem deps stay external — pulled in only when the caller
  // actually uses the tokenizer / xlsx adapters.
  external: ["xlsx", "gpt-tokenizer"],
});
