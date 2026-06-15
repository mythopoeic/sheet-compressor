/**
 * v0 heuristic token counter: ceil(UTF-16 code units / 4). Empty string → 0.
 *
 * Every language implementation MUST agree on this output. A real-tokenizer
 * injection point arrives in a later slice; until then this is the only
 * counter and it powers both the per-encoding and raw-baseline estimates.
 */
export function estimateTokens(s: string): number {
  if (s.length === 0) return 0;
  return Math.ceil(s.length / 4);
}
