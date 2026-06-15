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

export type CompressOptions = {
  // Reserved for future slices (anchor strategy selection, token counter
  // injection, etc.). v0 takes no options.
};

export type AnchorJson = {
  encoding: "anchor-skeleton";
  version: 0;
  origin: Origin;
  cells: Array<{ address: string; value: string }>;
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
    formatAggregation: Encoding<FormatAggregationJson>;
  };
  rawBaseline: { tokenEstimate: number };
};
