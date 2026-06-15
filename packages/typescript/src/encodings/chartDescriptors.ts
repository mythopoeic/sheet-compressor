import type { ChartDescriptor } from "../types.ts";

/**
 * Per SPEC §6.1: the contents of a double-quoted token field (title, xAxis,
 * yAxis). Backslash first so later rules' backslashes aren't double-escaped,
 * then the quote, then the whitespace controls.
 */
function escapeQuoted(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}

/**
 * Per SPEC §6.1: a single series name inside `series=[…]`. Backslash first,
 * then the bracket-list delimiters (`,` and `]`), then the whitespace controls.
 */
function escapeSeriesName(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/,/g, "\\,")
    .replace(/\]/g, "\\]")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}

/**
 * Render a single chart descriptor to the SPEC §6.1 token form. Optional
 * fields are omitted entirely when undefined or (for `dataRanges`/`series`)
 * when the source array is empty. The `name` field is intentionally not
 * rendered — it is a developer-facing identifier, not LLM context.
 */
export function renderChartToken(chart: ChartDescriptor): string {
  const parts: string[] = [`CHART(${chart.type})@${chart.anchorRange}`];
  if (chart.title !== undefined) {
    parts.push(`title="${escapeQuoted(chart.title)}"`);
  }
  if (chart.dataRanges && chart.dataRanges.length > 0) {
    parts.push(`data=${chart.dataRanges.join(",")}`);
  }
  if (chart.series && chart.series.length > 0) {
    parts.push(`series=[${chart.series.map(escapeSeriesName).join(",")}]`);
  }
  if (chart.axes?.x !== undefined) {
    parts.push(`xAxis="${escapeQuoted(chart.axes.x)}"`);
  }
  if (chart.axes?.y !== undefined) {
    parts.push(`yAxis="${escapeQuoted(chart.axes.y)}"`);
  }
  return parts.join(" ");
}

/**
 * Per SPEC §6.2: tokens joined by `\n` in input order, no trailing newline.
 * Returns `""` when `charts` is missing or empty.
 */
export function renderChartBlock(
  charts: ChartDescriptor[] | undefined,
): string {
  if (!charts || charts.length === 0) return "";
  return charts.map(renderChartToken).join("\n");
}

/**
 * Per SPEC §6.2: append the chart block to a cell-string with the documented
 * separator rule. Empty inputs collapse cleanly: empty cells + charts → charts
 * only; cells + no charts → cells only; both empty → empty string.
 */
export function appendChartBlock(cellString: string, chartBlock: string): string {
  if (chartBlock === "") return cellString;
  if (cellString === "") return chartBlock;
  return `${cellString}\n${chartBlock}`;
}
