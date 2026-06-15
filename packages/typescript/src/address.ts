/**
 * 1-indexed column number → Excel column letters.
 *   1 → "A", 26 → "Z", 27 → "AA", 52 → "AZ", 702 → "ZZ", 703 → "AAA".
 */
export function colToLetters(col: number): string {
  if (!Number.isInteger(col) || col < 1) {
    throw new RangeError(`column must be a positive integer, got ${col}`);
  }
  let n = col;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/** Format an A1 address from 1-indexed (row, col). */
export function a1(row: number, col: number): string {
  return `${colToLetters(col)}${row}`;
}
