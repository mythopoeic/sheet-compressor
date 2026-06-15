"""A1 address helpers. See SPEC §1.1."""


def col_to_letters(col: int) -> str:
    """1-indexed column number -> Excel column letters.

    1 -> "A", 26 -> "Z", 27 -> "AA", 52 -> "AZ", 702 -> "ZZ", 703 -> "AAA".
    """
    if not isinstance(col, int) or col < 1:
        raise ValueError(f"column must be a positive integer, got {col}")
    n = col
    out = ""
    while n > 0:
        rem = (n - 1) % 26
        out = chr(65 + rem) + out
        n = (n - 1) // 26
    return out


def a1(row: int, col: int) -> str:
    """Format an A1 address from 1-indexed (row, col)."""
    return f"{col_to_letters(col)}{row}"
