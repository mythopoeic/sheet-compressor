// Optional .xlsx adapter (Seam 2 in the PRD): reads a single sheet — grid,
// origin, per-cell data type, and embedded chart descriptors — into the core's
// input contract (`Grid`, see ../types.ts).
//
// SheetJS (`xlsx`) is declared in package.json under `optionalDependencies`
// so the pure core can be installed without it. This module loads SheetJS
// lazily via createRequire so importing this file in a host that lacks it
// only fails when readSheet() is actually called.

import { createRequire } from "node:module";

import { a1 } from "../address.ts";
import type {
  CellMeta,
  ChartDescriptor,
  ChartType,
  DataType,
  Grid,
} from "../types.ts";

export type ReadSheetOptions = {
  /**
   * Which sheet to read. Pass a sheet name (string) or 0-indexed position
   * (number). Defaults to the workbook's first sheet.
   */
  sheet?: string | number;
};

/** A buffer-ish input the underlying tokenizer / xlsx parser accepts. */
export type ReadSheetInput = string | Buffer | Uint8Array | ArrayBuffer;

const req = createRequire(import.meta.url);

/* -------------------------------------------------------------------------- */
/* SheetJS — lazy load + minimal local typing                                 */
/* -------------------------------------------------------------------------- */

// Hand-typed subset of the SheetJS surface this adapter touches. We deliberately
// don't import xlsx's own types: the dep is optional and may not be installed.
type XlsxCell = {
  t: "s" | "n" | "b" | "d" | "e" | "z";
  v?: string | number | boolean | Date;
  w?: string;
  f?: string;
};
type XlsxSheet = Record<string, XlsxCell | unknown> & {
  "!ref"?: string;
};
type XlsxWorkbook = {
  SheetNames: string[];
  Sheets: Record<string, XlsxSheet>;
  keys?: string[];
  files?: Record<string, { content?: Buffer | Uint8Array }>;
};
type XlsxCellAddress = { r: number; c: number };
type XlsxRange = { s: XlsxCellAddress; e: XlsxCellAddress };
type XlsxModule = {
  read: (data: unknown, opts?: Record<string, unknown>) => XlsxWorkbook;
  readFile: (path: string, opts?: Record<string, unknown>) => XlsxWorkbook;
  utils: {
    decode_range: (s: string) => XlsxRange;
    decode_cell: (s: string) => XlsxCellAddress;
    encode_cell: (a: XlsxCellAddress) => string;
  };
};

function loadXlsx(): XlsxModule {
  try {
    return req("xlsx") as XlsxModule;
  } catch (cause) {
    throw new Error(
      "readSheet() requires the optional 'xlsx' (SheetJS) dependency. " +
        "Install it with `npm install xlsx`, or build the Grid yourself " +
        "and pass it directly to compress().",
      { cause },
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Cell-type mapping                                                          */
/* -------------------------------------------------------------------------- */

const T_TO_DATA_TYPE: Record<XlsxCell["t"], DataType> = {
  s: "text",
  n: "number",
  b: "bool",
  d: "date",
  e: "error",
  z: "empty",
};

function inferDataType(cell: XlsxCell | undefined): DataType {
  if (!cell) return "empty";
  // Formula wins over type — a `=SUM()` cell is `formula` regardless of the
  // underlying evaluated type. The core only ever reads dataType (Phase 2
  // adds style flags) so collapsing here is safe.
  if (cell.f) return "formula";
  return T_TO_DATA_TYPE[cell.t];
}

function cellText(cell: XlsxCell | undefined): string {
  if (!cell) return "";
  if (cell.w !== undefined) return cell.w;
  const v = cell.v;
  if (v === undefined || v === null) return "";
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

/* -------------------------------------------------------------------------- */
/* Chart extraction — walks workbook XML via the `bookFiles` payload          */
/* -------------------------------------------------------------------------- */

const CHART_BODY_TO_TYPE: Record<string, ChartType> = {
  barChart: "bar",
  bar3DChart: "bar",
  lineChart: "line",
  line3DChart: "line",
  pieChart: "pie",
  pie3DChart: "pie",
  doughnutChart: "pie",
  scatterChart: "scatter",
  bubbleChart: "scatter",
  areaChart: "area",
  area3DChart: "area",
};

type RelMap = Record<string, { type: string; target: string }>;

function parseRels(xml: string): RelMap {
  const out: RelMap = {};
  const re =
    /<Relationship\s+[^>]*?\bId="([^"]+)"[^>]*?\bType="([^"]+)"[^>]*?\bTarget="([^"]+)"[^>]*?\/?>/g;
  for (let m; (m = re.exec(xml)); ) {
    out[m[1]!] = { type: m[2]!, target: m[3]! };
  }
  return out;
}

/** Resolve a relationship Target against the part containing it. */
function resolveRelTarget(partPath: string, target: string): string {
  if (target.startsWith("/")) return target.replace(/^\/+/, "");
  const parentSegs = partPath.split("/");
  parentSegs.pop(); // drop the file
  const relSegs = target.split("/");
  while (relSegs[0] === "..") {
    relSegs.shift();
    parentSegs.pop();
  }
  return [...parentSegs, ...relSegs].join("/");
}

function decodeXmlText(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Concatenate every `<a:t>…</a:t>` text run inside the wrapper. */
function extractRichText(scope: string): string | undefined {
  const parts: string[] = [];
  const re = /<a:t[^>]*>([\s\S]*?)<\/a:t>/g;
  for (let m; (m = re.exec(scope)); ) parts.push(decodeXmlText(m[1]!));
  if (parts.length === 0) return undefined;
  return parts.join("");
}

/** First `<…:title>` block under `scope`; supports both `c:` and unprefixed. */
function extractTitle(scope: string): string | undefined {
  const m = /<(?:c:)?title>([\s\S]*?)<\/(?:c:)?title>/.exec(scope);
  return m ? extractRichText(m[1]!) : undefined;
}

function extractFieldText(xml: string, tag: string): string | undefined {
  const m = new RegExp(
    `<(?:c:)?${tag}>([\\s\\S]*?)<\\/(?:c:)?${tag}>`,
  ).exec(xml);
  if (!m) return undefined;
  return decodeXmlText(m[1]!.trim());
}

/** Normalise a chart cell-reference (`Sheet1!$B$2:$B$4` → `B2:B4`). */
function normalizeRange(ref: string): string {
  const bang = ref.lastIndexOf("!");
  const tail = bang >= 0 ? ref.slice(bang + 1) : ref;
  return tail.replace(/\$/g, "").replace(/^'|'$/g, "");
}

/** Everything `parseChartXml` can derive from a chart XML part. The two
 * fields it can't (`name`, `anchorRange`) live on the parent drawing/anchor. */
type ParsedChart = Omit<ChartDescriptor, "name" | "anchorRange">;

function parseChartXml(xml: string): ParsedChart {
  // Chart type: first known chart-body element under plotArea.
  let chartType: ChartType = "other";
  for (const [tag, t] of Object.entries(CHART_BODY_TO_TYPE)) {
    if (new RegExp(`<c:${tag}[ >]`).test(xml)) {
      chartType = t;
      break;
    }
  }

  // Title under <c:chart>.
  const chartScope = /<c:chart>([\s\S]*?)<\/c:chart>/.exec(xml)?.[1] ?? xml;
  const title = extractTitle(
    // Only the segment OUTSIDE plotArea — plotArea contains axis titles too.
    chartScope.replace(/<c:plotArea>[\s\S]*?<\/c:plotArea>/, ""),
  );

  // Axis titles: catAx/dateAx → x, valAx → y. First match of each wins.
  const xAxBlock =
    /<c:(?:catAx|dateAx)>([\s\S]*?)<\/c:(?:catAx|dateAx)>/.exec(xml)?.[1];
  const yAxBlock = /<c:valAx>([\s\S]*?)<\/c:valAx>/.exec(xml)?.[1];
  const axes: { x?: string; y?: string } = {};
  if (xAxBlock !== undefined) {
    const t = extractTitle(xAxBlock);
    if (t !== undefined) axes.x = t;
  }
  if (yAxBlock !== undefined) {
    const t = extractTitle(yAxBlock);
    if (t !== undefined) axes.y = t;
  }

  // Series: every <c:ser>…</c:ser>. Name from c:tx (literal c:v or strRef.c:f),
  // values from c:val/c:numRef/c:f (or c:cat for category-only charts).
  const series: string[] = [];
  const data: string[] = [];
  const serRe = /<c:ser>([\s\S]*?)<\/c:ser>/g;
  for (let m; (m = serRe.exec(xml)); ) {
    const ser = m[1]!;
    const txBlock = /<c:tx>([\s\S]*?)<\/c:tx>/.exec(ser)?.[1];
    if (txBlock !== undefined) {
      const literal = extractFieldText(txBlock, "v");
      if (literal !== undefined) {
        series.push(literal);
      } else {
        const cellRef = extractFieldText(txBlock, "f");
        if (cellRef !== undefined) series.push(normalizeRange(cellRef));
      }
    }
    const valBlock =
      /<c:val>([\s\S]*?)<\/c:val>/.exec(ser)?.[1] ??
      /<c:cat>([\s\S]*?)<\/c:cat>/.exec(ser)?.[1];
    if (valBlock !== undefined) {
      const cellRef = extractFieldText(valBlock, "f");
      if (cellRef !== undefined) data.push(normalizeRange(cellRef));
    }
  }

  const result: ParsedChart = { type: chartType };
  if (title !== undefined) result.title = title;
  if (axes.x !== undefined || axes.y !== undefined) result.axes = axes;
  if (series.length > 0) result.series = series;
  if (data.length > 0) result.dataRanges = data;
  return result;
}

function anchorRangeFromDrawing(scope: string): string | undefined {
  const m =
    /<xdr:from>[\s\S]*?<xdr:col>(\d+)<\/xdr:col>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>[\s\S]*?<\/xdr:from>[\s\S]*?<xdr:to>[\s\S]*?<xdr:col>(\d+)<\/xdr:col>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>[\s\S]*?<\/xdr:to>/.exec(
      scope,
    );
  if (!m) return undefined;
  const fc = Number(m[1]) + 1;
  const fr = Number(m[2]) + 1;
  const tc = Number(m[3]) + 1;
  const tr = Number(m[4]) + 1;
  return `${a1(fr, fc)}:${a1(tr, tc)}`;
}

function nameFromAnchor(scope: string): string {
  return /<xdr:cNvPr\s+[^>]*?\bname="([^"]*)"/.exec(scope)?.[1] ?? "";
}

function fileText(
  files: Record<string, { content?: Buffer | Uint8Array }>,
  path: string,
): string | undefined {
  const f = files[path];
  if (!f?.content) return undefined;
  return Buffer.from(f.content).toString("utf8");
}

function extractCharts(
  wb: XlsxWorkbook,
  sheetIndex: number,
): ChartDescriptor[] {
  const files = wb.files;
  if (!files) return [];
  const sheetPath = `xl/worksheets/sheet${sheetIndex + 1}.xml`;
  const sheetXml = fileText(files, sheetPath);
  if (sheetXml === undefined) return [];

  // Find the worksheet's drawing relId (only one drawing part per sheet in v0).
  const drawingRelId = /<drawing\s+[^>]*?r:id="([^"]+)"/.exec(sheetXml)?.[1];
  if (drawingRelId === undefined) return [];

  const sheetRelsPath = `xl/worksheets/_rels/sheet${sheetIndex + 1}.xml.rels`;
  const sheetRels = parseRels(fileText(files, sheetRelsPath) ?? "");
  const drawingRel = sheetRels[drawingRelId];
  if (!drawingRel) return [];

  const drawingPath = resolveRelTarget(sheetPath, drawingRel.target);
  const drawingXml = fileText(files, drawingPath);
  if (drawingXml === undefined) return [];

  const drawingRelsPath = drawingPath.replace(
    /([^/]+)$/,
    "_rels/$1.rels",
  );
  const drawingRels = parseRels(fileText(files, drawingRelsPath) ?? "");

  const charts: ChartDescriptor[] = [];
  const anchorRe =
    /<xdr:(?:twoCellAnchor|oneCellAnchor|absoluteAnchor)\b[\s\S]*?<\/xdr:(?:twoCellAnchor|oneCellAnchor|absoluteAnchor)>/g;
  for (let m; (m = anchorRe.exec(drawingXml)); ) {
    const anchor = m[0];
    const chartRelId = /<c:chart\s+[^>]*?r:id="([^"]+)"/.exec(anchor)?.[1];
    if (chartRelId === undefined) continue;
    const chartRel = drawingRels[chartRelId];
    if (!chartRel) continue;
    const chartPath = resolveRelTarget(drawingPath, chartRel.target);
    const chartXml = fileText(files, chartPath);
    if (chartXml === undefined) continue;

    const anchorRange = anchorRangeFromDrawing(anchor);
    if (anchorRange === undefined) continue;

    // parseChartXml omits any optional field with no value, so the spread
    // never leaks `undefined` keys into the descriptor.
    charts.push({
      ...parseChartXml(chartXml),
      name: nameFromAnchor(anchor),
      anchorRange,
    });
  }
  return charts;
}

/* -------------------------------------------------------------------------- */
/* Public entry point                                                         */
/* -------------------------------------------------------------------------- */

export function readSheet(
  input: ReadSheetInput,
  options: ReadSheetOptions = {},
): Grid {
  const xlsx = loadXlsx();
  const wb =
    typeof input === "string"
      ? xlsx.readFile(input, { cellDates: true, bookFiles: true })
      : xlsx.read(input, {
          type: ArrayBuffer.isView(input) ? "buffer" : "array",
          cellDates: true,
          bookFiles: true,
        });

  if (wb.SheetNames.length === 0) {
    throw new Error("readSheet(): workbook contains no sheets");
  }

  let sheetName: string;
  let sheetIndex: number;
  if (typeof options.sheet === "string") {
    const i = wb.SheetNames.indexOf(options.sheet);
    if (i < 0) {
      throw new Error(
        `readSheet(): sheet "${options.sheet}" not found in workbook ` +
          `(available: ${wb.SheetNames.join(", ")})`,
      );
    }
    sheetIndex = i;
    sheetName = options.sheet;
  } else {
    sheetIndex = options.sheet ?? 0;
    const found = wb.SheetNames[sheetIndex];
    if (found === undefined) {
      throw new Error(
        `readSheet(): sheet index ${sheetIndex} out of range ` +
          `(workbook has ${wb.SheetNames.length} sheet(s))`,
      );
    }
    sheetName = found;
  }

  const ws = wb.Sheets[sheetName]!;
  const ref = ws["!ref"];

  // Empty worksheet — emit an empty grid anchored at A1. cellMeta is omitted
  // (there are no cells to describe).
  let grid: Grid;
  if (typeof ref !== "string" || ref.length === 0) {
    grid = { rows: [], origin: { row: 1, col: 1 } };
  } else {
    const range = xlsx.utils.decode_range(ref);
    const rows: string[][] = [];
    const cellMeta: CellMeta[][] = [];
    for (let r = range.s.r; r <= range.e.r; r++) {
      const rowVals: string[] = [];
      const rowMeta: CellMeta[] = [];
      for (let c = range.s.c; c <= range.e.c; c++) {
        const addr = xlsx.utils.encode_cell({ r, c });
        const cell = ws[addr] as XlsxCell | undefined;
        rowVals.push(cellText(cell));
        rowMeta.push({ dataType: inferDataType(cell) });
      }
      rows.push(rowVals);
      cellMeta.push(rowMeta);
    }
    grid = {
      rows,
      origin: { row: range.s.r + 1, col: range.s.c + 1 },
      cellMeta,
    };
  }

  const charts = extractCharts(wb, sheetIndex);
  if (charts.length > 0) grid.charts = charts;
  return grid;
}
