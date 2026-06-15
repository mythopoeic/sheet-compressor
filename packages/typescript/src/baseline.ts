import type { Grid } from "./types.ts";

/**
 * The "vanilla" un-compressed representation of a grid: rows joined with ` | `,
 * separated by `\n`, no escaping, no address prefixes. This is the form
 * `rawBaseline.tokenEstimate` is measured against — i.e. the raw text a
 * developer would otherwise paste into a prompt.
 */
export function vanillaEncode(grid: Grid): string {
  return grid.rows.map((row) => row.join(" | ")).join("\n");
}
