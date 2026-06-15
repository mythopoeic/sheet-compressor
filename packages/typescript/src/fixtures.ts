import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import type { Grid } from "./types.ts";

export type FixtureMeta = {
  id: string;
  title: string;
  description: string;
};

export type Fixture = {
  id: string;
  dir: string;
  meta: FixtureMeta;
  input: Grid;
};

/**
 * Absolute path to the language-neutral corpus root, resolved relative to this
 * source file so it works regardless of process cwd.
 */
export function corpusRoot(): string {
  // src/fixtures.ts → packages/typescript/src → ../.. → packages/typescript
  // → ../.. → repo root → fixtures/corpus
  return join(import.meta.dirname, "..", "..", "..", "fixtures", "corpus");
}

export function loadFixtures(root: string = corpusRoot()): Fixture[] {
  const ids = readdirSync(root)
    .filter((name) => {
      const dir = join(root, name);
      return statSync(dir).isDirectory();
    })
    .sort();
  return ids.map((id) => {
    const dir = join(root, id);
    const input = JSON.parse(
      readFileSync(join(dir, "input.json"), "utf8"),
    ) as Grid;
    const meta = JSON.parse(
      readFileSync(join(dir, "meta.json"), "utf8"),
    ) as FixtureMeta;
    return { id, dir, meta, input };
  });
}

export const goldenFiles = {
  anchorString: "anchor.string.txt",
  anchorJson: "anchor.json",
  anchorTokens: "anchor.tokenEstimate.txt",
  invertedIndexString: "invertedIndex.string.txt",
  invertedIndexJson: "invertedIndex.json",
  invertedIndexTokens: "invertedIndex.tokenEstimate.txt",
  rawBaselineTokens: "rawBaseline.tokenEstimate.txt",
} as const;
