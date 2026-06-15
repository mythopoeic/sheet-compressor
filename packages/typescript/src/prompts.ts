// Mirror of the shared `prompts/` source at the repo root. SPEC §9.
//
// The TypeScript constants are loaded once at module init from the canonical
// markdown files. Other language ports do the same in their idiomatic form;
// the byte-equality of every `prompts.*` constant against the file on disk is
// what keeps the family consistent.
//
// To change a prompt, edit the file under `prompts/` — never inline it here.

import { readFileSync } from "node:fs";
import { join } from "node:path";

function promptsRoot(): string {
  // src/prompts.ts → packages/typescript/src → ../.. → packages/typescript
  // → ../.. → repo root → prompts
  return join(import.meta.dirname, "..", "..", "..", "prompts");
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
