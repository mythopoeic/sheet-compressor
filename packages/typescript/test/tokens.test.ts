import { describe, expect, it, vi } from "vitest";

import { compress, createTokenCounter, estimateTokens } from "../src/index.ts";
import type { Grid, TokenCounter } from "../src/index.ts";

const sampleGrid: Grid = {
  origin: { row: 1, col: 1 },
  rows: [
    ["Name", "Qty", "Price"],
    ["Apple", "3", "1.50"],
    ["", "", ""],
    ["Pear", "5", "0.30"],
  ],
};

describe("estimateTokens (heuristic)", () => {
  it("returns 0 for the empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("matches ceil(utf16 length / 4) — SPEC §7", () => {
    // Boundary cases around the ceil() threshold.
    expect(estimateTokens("a")).toBe(1);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
    expect(estimateTokens("abcdefgh")).toBe(2);
    expect(estimateTokens("abcdefghi")).toBe(3);
  });

  it("is deterministic: repeated calls on the same input agree", () => {
    const inputs = ["", "x", "abcde", "the quick brown fox", "🦊", "\n\t,|"];
    for (const s of inputs) {
      const first = estimateTokens(s);
      for (let i = 0; i < 5; i++) {
        expect(estimateTokens(s)).toBe(first);
      }
    }
  });

  it("counts UTF-16 code units, not code points (so surrogate pairs count 2)", () => {
    // "🦊" is one code point but two UTF-16 code units → ceil(2/4) = 1.
    expect(estimateTokens("🦊")).toBe(1);
    // Four foxes = 8 code units → ceil(8/4) = 2.
    expect(estimateTokens("🦊🦊🦊🦊")).toBe(2);
  });
});

describe("compress() — injectable token counter", () => {
  it("defaults to the heuristic when no counter is supplied", () => {
    const r = compress(sampleGrid);
    expect(r.encodings.anchor.tokenEstimate).toBe(
      estimateTokens(r.encodings.anchor.string),
    );
    const vanilla =
      "Name | Qty | Price\nApple | 3 | 1.50\n |  | \nPear | 5 | 0.30";
    expect(r.rawBaseline.tokenEstimate).toBe(estimateTokens(vanilla));
  });

  it("uses the injected counter for raw baseline AND every encoding", () => {
    const counter = vi.fn<TokenCounter>((s) => s.length * 100);
    const r = compress(sampleGrid, { tokenCounter: counter });

    expect(r.encodings.anchor.tokenEstimate).toBe(
      r.encodings.anchor.string.length * 100,
    );
    const vanilla =
      "Name | Qty | Price\nApple | 3 | 1.50\n |  | \nPear | 5 | 0.30";
    expect(r.rawBaseline.tokenEstimate).toBe(vanilla.length * 100);

    // Sanity: the heuristic was NOT used.
    expect(counter).toHaveBeenCalled();
    expect(counter).toHaveBeenCalledWith(r.encodings.anchor.string);
    expect(counter).toHaveBeenCalledWith(vanilla);
  });

  it("injects a constant counter unchanged (no internal massaging)", () => {
    const r = compress(sampleGrid, { tokenCounter: () => 42 });
    expect(r.encodings.anchor.tokenEstimate).toBe(42);
    expect(r.rawBaseline.tokenEstimate).toBe(42);
  });
});

describe("createTokenCounter() — gpt-tokenizer adapter", () => {
  it("returns a TokenCounter backed by gpt-tokenizer's o200k_base by default", () => {
    const counter = createTokenCounter();
    expect(typeof counter("")).toBe("number");
    // Empty string → 0 tokens for any sane BPE encoding.
    expect(counter("")).toBe(0);
    // Non-trivial strings produce a positive count.
    expect(counter("hello world")).toBeGreaterThan(0);
  });

  it("is deterministic — same input → same count, across calls and instances", () => {
    const a = createTokenCounter();
    const b = createTokenCounter({ encoding: "o200k_base" });
    const inputs = ["hello world", "A1,Name|B1,Qty|C1,Price", "🦊 zest"];
    for (const s of inputs) {
      const first = a(s);
      for (let i = 0; i < 3; i++) expect(a(s)).toBe(first);
      expect(b(s)).toBe(first);
    }
  });

  it("encodings disagree on tokenisation (proves cl100k_base ≠ o200k_base wiring)", () => {
    // Picked so o200k_base and cl100k_base split it differently. If a future
    // gpt-tokenizer release makes them coincide, swap to another string —
    // the point of the assertion is that the encoding option is wired
    // through, not that any specific token count is canonical.
    const s = "supercalifragilisticexpialidocious";
    const o200k = createTokenCounter({ encoding: "o200k_base" })(s);
    const cl100k = createTokenCounter({ encoding: "cl100k_base" })(s);
    expect(o200k).not.toBe(cl100k);
  });

  it("flows through compress() so per-encoding estimates use the real tokenizer", () => {
    const counter = createTokenCounter();
    const r = compress(sampleGrid, { tokenCounter: counter });
    expect(r.encodings.anchor.tokenEstimate).toBe(
      counter(r.encodings.anchor.string),
    );
    // Real tokenizer disagrees with the heuristic on this fixture — proves
    // we're not silently falling back.
    const heuristic = estimateTokens(r.encodings.anchor.string);
    expect(r.encodings.anchor.tokenEstimate).not.toBe(heuristic);
  });
});
