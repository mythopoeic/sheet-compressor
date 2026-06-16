/**
 * Drift guard for the Office Script bundle. Mirrors the byte-equality pattern in
 * packages/typescript/test/prompts.test.ts: the committed `.osts` artifacts are
 * GENERATED from the verified TS reference core (and the fixture corpus), so a
 * change to either source that isn't reflected in the committed bundle is drift.
 *
 * This test re-runs the generator IN MEMORY and asserts every committed artifact
 * matches byte-for-byte. It also independently re-derives the embedded fixtures
 * to confirm conformance.osts carries the current corpus.
 *
 * If this fails after an intentional change, run `npm run generate` and commit.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ARTIFACT_PATHS,
  buildArtifacts,
  loadFixtures,
} from "../scripts/generate-bundle.ts";

describe("Office Script bundle — drift guard", () => {
  const built = buildArtifacts();

  it("SheetCompressorInternal.generated.osts matches the regenerated core byte-for-byte", () => {
    const onDisk = readFileSync(ARTIFACT_PATHS.generatedCore, "utf8");
    expect(onDisk).toBe(built.generatedCore);
  });

  it("SheetCompressor.osts (shippable) matches the regenerated script byte-for-byte", () => {
    const onDisk = readFileSync(ARTIFACT_PATHS.shippable, "utf8");
    expect(onDisk).toBe(built.shippable);
  });

  it("conformance.osts matches the regenerated harness byte-for-byte", () => {
    const onDisk = readFileSync(ARTIFACT_PATHS.conformance, "utf8");
    expect(onDisk).toBe(built.conformance);
  });

  it("embeds every fixture currently in fixtures/corpus/", () => {
    const corpusRoot = join(
      import.meta.dirname,
      "..",
      "..",
      "..",
      "fixtures",
      "corpus",
    );
    const corpusIds = readdirSync(corpusRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    const embeddedIds = loadFixtures().map((f) => f.id);
    expect(embeddedIds).toEqual(corpusIds);
    // The committed conformance.osts must mention every fixture id, proving the
    // embedded literal is current (not just that loadFixtures found them). The
    // payload is a JSON-string-inside-a-JSON-string-literal, so each id appears
    // with escaped quotes (e.g. \"id\": \"empty\").
    const conformance = readFileSync(ARTIFACT_PATHS.conformance, "utf8");
    for (const id of corpusIds) {
      expect(conformance).toContain(`\\"id\\": \\"${id}\\"`);
    }
  });

  it("the bundle core is ExcelScript-pure (no node/require/import.meta)", () => {
    const core = readFileSync(ARTIFACT_PATHS.generatedCore, "utf8");
    expect(core).not.toMatch(/\brequire\b/);
    expect(core).not.toMatch(/createRequire/);
    expect(core).not.toMatch(/import\.meta/);
    expect(core).not.toMatch(/node:/);
    // No top-level module imports survived the strip.
    expect(core).not.toMatch(/^\s*import\b/m);
  });
});
