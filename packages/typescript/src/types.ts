// Public types for the sheet-compressor TypeScript reference implementation.
// See ../../../spec/SPEC.md for the language-neutral contract.

export type Origin = {
  /** 1-indexed row of the grid's top-left cell. */
  row: number;
  /** 1-indexed column of the grid's top-left cell. */
  col: number;
};

export type DataType =
  | "text"
  | "number"
  | "date"
  | "bool"
  | "formula"
  | "error"
  | "empty";

export type CellMeta = {
  dataType?: DataType;
};

export type ChartType = "bar" | "line" | "pie" | "scatter" | "area" | "other";

export type ChartDescriptor = {
  name: string;
  type: ChartType;
  anchorRange: string;
  title?: string;
  dataRanges?: string[];
  series?: string[];
  axes?: { x?: string; y?: string };
};

export type Grid = {
  rows: string[][];
  origin: Origin;
  cellMeta?: CellMeta[][];
  charts?: ChartDescriptor[];
};

/**
 * Pure function string → token count. Injected via {@link CompressOptions} so
 * callers can supply a real tokenizer (gpt-tokenizer / js-tiktoken / …) without
 * coupling the core to one. Must be deterministic for a given input.
 */
export type TokenCounter = (s: string) => number;

export type CompressOptions = {
  /**
   * Counts tokens for the raw-baseline and each encoding's `string`. Defaults
   * to the shared SPEC heuristic (see `estimateTokens`) when omitted, which is
   * the only counter every cross-language port is required to agree on.
   */
  tokenCounter?: TokenCounter;
};

export type AnchorJson = {
  encoding: "anchor-skeleton";
  version: 0;
  origin: Origin;
  cells: Array<{ address: string; value: string }>;
};

export type Encoding<TJson = unknown> = {
  string: string;
  json: TJson;
  tokenEstimate: number;
};

export type CompressResult = {
  encodings: {
    anchor: Encoding<AnchorJson>;
  };
  rawBaseline: { tokenEstimate: number };
};
