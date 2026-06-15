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
 * The result of anchor detection: which rows and columns (0-indexed into
 * `grid.rows`) the active strategy decided to keep. The anchor encoder emits
 * cells only at `(r, c)` where `r ∈ keptRows` AND `c ∈ keptCols`.
 */
export type AnchorDetection = {
  keptRows: ReadonlySet<number>;
  keptCols: ReadonlySet<number>;
};

/**
 * Pluggable anchor-detection strategy. See SPEC §3.1 for the contract.
 * v0 ships `keep-all` (legacy no-op) and `phase1` (the default).
 */
export type AnchorStrategy = {
  readonly name: string;
  detect(grid: Grid): AnchorDetection;
};

/** Built-in strategy selectors. */
export type AnchorStrategyName = "keep-all" | "phase1";

/**
 * Pure function string → token count. Injected via {@link CompressOptions} so
 * callers can supply a real tokenizer (gpt-tokenizer / js-tiktoken / …) without
 * coupling the core to one. Must be deterministic for a given input.
 */
export type TokenCounter = (s: string) => number;

export type CompressOptions = {
  /**
   * Anchor-detection strategy. Pass a built-in name or a custom
   * `AnchorStrategy`. Defaults to `"phase1"`.
   */
  anchorStrategy?: AnchorStrategyName | AnchorStrategy;
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

export type InvertedIndexJson = {
  encoding: "inverted-index";
  version: 0;
  origin: Origin;
  groups: Array<{ value: string; ranges: string[] }>;
};

export type FormatType =
  | "IntNum"
  | "FloatNum"
  | "ScientificNum"
  | "PercentageNum"
  | "CurrencyData"
  | "DateData"
  | "TimeData"
  | "YearData"
  | "EmailData"
  | "Boolean"
  | "Text";

export type FormatAggregationJson = {
  encoding: "format-aggregation";
  version: 0;
  origin: Origin;
  groups: Array<{ type: FormatType; ranges: string[] }>;
};

export type Encoding<TJson = unknown> = {
  string: string;
  json: TJson;
  tokenEstimate: number;
};

export type CompressResult = {
  encodings: {
    anchor: Encoding<AnchorJson>;
    invertedIndex: Encoding<InvertedIndexJson>;
    formatAggregation: Encoding<FormatAggregationJson>;
  };
  /**
   * Echo of `grid.charts` in input order, after CHART(...) tokens have already
   * been appended into each encoding's `.string` (SPEC §6). Empty array when
   * `grid.charts` is missing or empty.
   */
  charts: ChartDescriptor[];
  rawBaseline: { tokenEstimate: number };
};
