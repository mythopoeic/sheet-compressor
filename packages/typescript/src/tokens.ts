import { createRequire } from "node:module";

import type { TokenCounter } from "./types.ts";

/**
 * v0 heuristic token counter (SPEC §7): `ceil(utf16-code-units / 4)`, with
 * `""` → 0. Deterministic, dependency-free, and the shared cross-language
 * baseline every implementation MUST agree on. Real tokenizers are layered on
 * top via {@link createTokenCounter} or any user-supplied
 * {@link TokenCounter}.
 */
export function estimateTokens(s: string): number {
  if (s.length === 0) return 0;
  return Math.ceil(s.length / 4);
}

/**
 * The set of tiktoken-style BPE encodings exposed by `gpt-tokenizer`. We pin
 * this list in the public type so users get autocomplete without having to
 * import a gpt-tokenizer type that may not be installed.
 */
export type TiktokenEncoding =
  | "o200k_base"
  | "cl100k_base"
  | "p50k_base"
  | "p50k_edit"
  | "r50k_base";

export type CreateTokenCounterOptions = {
  /** BPE encoding name. Defaults to `o200k_base` (GPT-4o / GPT-5 family). */
  encoding?: TiktokenEncoding;
};

/**
 * The TS package's default real-tokenizer counter. Loads the requested
 * `gpt-tokenizer` encoding (declared in `package.json` under
 * `optionalDependencies` so installs don't fail on hosts that can't ship it)
 * and returns a {@link TokenCounter} that calls `countTokens` on it.
 *
 * Throws synchronously if `gpt-tokenizer` is not installed, so callers in
 * environments that can't ship it (restricted bundlers, no-tokenizer hosts,
 * …) can catch and fall back to the heuristic.
 *
 * Defaults to the `o200k_base` encoding per the PRD. Pass `{ encoding }` to
 * target a different model family (e.g. `cl100k_base` for GPT-3.5 / GPT-4).
 */
export function createTokenCounter(
  options: CreateTokenCounterOptions = {},
): TokenCounter {
  const encoding = options.encoding ?? "o200k_base";
  const mod = loadGptTokenizerEncoding(encoding);
  return (s: string): number => mod.countTokens(s);
}

type GptTokenizerEncoding = { countTokens: (s: string) => number };

const req = createRequire(import.meta.url);

function loadGptTokenizerEncoding(
  encoding: TiktokenEncoding,
): GptTokenizerEncoding {
  try {
    return req(`gpt-tokenizer/encoding/${encoding}`) as GptTokenizerEncoding;
  } catch (cause) {
    throw new Error(
      "createTokenCounter() requires the optional 'gpt-tokenizer' dependency. " +
        "Install it with `npm install gpt-tokenizer`, or pass a custom " +
        "tokenCounter to compress().",
      { cause },
    );
  }
}
