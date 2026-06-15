// Mirror of the shared `prompts/` source at the repo root. SPEC §9.
//
// The TypeScript constants are loaded once at module init from the canonical
// markdown files. Other language ports do the same in their idiomatic form;
// the byte-equality of every `prompts.*` constant against the file on disk is
// what keeps the family consistent.
//
// To change a prompt, edit the file under `prompts/` — never inline it here.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Search order for the canonical prompts/ tree:
//   1. Sibling of src/ — the published-tarball layout. `prepack` copies
//      `prompts/` into the package and `files` ships it. Without this, a
//      standalone `npm install sheet-compressor` would lack the prompts and
//      every prompts.* access would throw ENOENT at import time (issue #19).
//   2. Three levels up from src/ — the in-repo monorepo layout (the canonical
//      `prompts/` at the repo root, used during development).
const PROMPT_ROOTS = [
  join(import.meta.dirname, "..", "prompts"),
  join(import.meta.dirname, "..", "..", "..", "prompts"),
];

function promptsRoot(): string {
  for (const dir of PROMPT_ROOTS) {
    if (existsSync(join(dir, "readers", "anchor.md"))) return dir;
  }
  throw new Error(
    `sheet-compressor: prompts/ not found; searched ${PROMPT_ROOTS.join(", ")}`,
  );
}

function read(file: string): string {
  return readFileSync(join(promptsRoot(), file), "utf8");
}

export type Prompts = {
  readers: {
    anchor: string;
    invertedIndex: string;
    formatAggregation: string;
  };
  tasks: {
    tableRegionDetection: string;
    cellValueLookup: string;
    sheetQA: string;
  };
  snippets: {
    chartDescriptor: string;
  };
};

export const prompts: Prompts = {
  readers: {
    anchor: read("readers/anchor.md"),
    invertedIndex: read("readers/invertedIndex.md"),
    formatAggregation: read("readers/formatAggregation.md"),
  },
  tasks: {
    tableRegionDetection: read("tasks/tableRegionDetection.md"),
    cellValueLookup: read("tasks/cellValueLookup.md"),
    sheetQA: read("tasks/sheetQA.md"),
  },
  snippets: {
    chartDescriptor: read("snippets/chartDescriptor.md"),
  },
};
