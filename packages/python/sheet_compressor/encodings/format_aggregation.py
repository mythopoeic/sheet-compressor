"""Format-aggregation encoding (SPEC §5)."""

import re
from typing import Any, List, Mapping, Optional

from ..address import a1

# SPEC §5.1: canonical emission order.
_TYPE_ORDER = (
    "IntNum",
    "FloatNum",
    "ScientificNum",
    "PercentageNum",
    "CurrencyData",
    "DateData",
    "TimeData",
    "YearData",
    "EmailData",
    "Boolean",
    "Text",
)

# SPEC §5.1 classification patterns, priority order — first match wins.
_BOOLEAN = re.compile(r"^(?:true|false)$", re.IGNORECASE)
_EMAIL = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
_SCIENTIFIC = re.compile(r"^-?\d+(?:\.\d+)?[eE][+-]?\d+$")
_PERCENT = re.compile(r"^-?\d+(?:\.\d+)?%$")
_CURRENCY = re.compile(r"^-?[$€£¥]\d+(?:\.\d+)?$")
_DATE_ISO = re.compile(r"^\d{4}-\d{1,2}-\d{1,2}$")
_DATE_SLASH = re.compile(r"^\d{1,2}/\d{1,2}/\d{2,4}$")
_DATE_DASH = re.compile(r"^\d{1,2}-\d{1,2}-\d{2,4}$")
_TIME_12 = re.compile(r"^\d{1,2}:\d{2}(?::\d{2})?\s?(?:AM|PM|am|pm)$")
_TIME_24 = re.compile(r"^\d{1,2}:\d{2}(?::\d{2})?$")
_YEAR = re.compile(r"^(?:19|20)\d{2}$")
_FLOAT = re.compile(r"^-?(?:\d+\.\d*|\.\d+)$")
_INT = re.compile(r"^-?\d+$")

# SPEC §5.1.1: column-header labels that mark a column as holding years.
# Matched case-insensitively as whole words.
_YEAR_HEADER = re.compile(r"\b(?:years?|yr|yyyy|fy|fiscal\s*years?)\b", re.IGNORECASE)


def classify(v: str) -> Optional[str]:
    """SPEC §5.1: classify by value alone. Returns None for ""."""
    if v == "":
        return None
    if _BOOLEAN.match(v):
        return "Boolean"
    if _EMAIL.match(v):
        return "EmailData"
    if _SCIENTIFIC.match(v):
        return "ScientificNum"
    if _PERCENT.match(v):
        return "PercentageNum"
    if _CURRENCY.match(v):
        return "CurrencyData"
    if _DATE_ISO.match(v) or _DATE_SLASH.match(v) or _DATE_DASH.match(v):
        return "DateData"
    if _TIME_12.match(v) or _TIME_24.match(v):
        return "TimeData"
    if _YEAR.match(v):
        return "YearData"
    if _FLOAT.match(v):
        return "FloatNum"
    if _INT.match(v):
        return "IntNum"
    return "Text"


def _cell(rows, r: int, c: int) -> str:
    if r < 0 or r >= len(rows):
        return ""
    row = rows[r]
    if c < 0 or c >= len(row):
        return ""
    return row[c]


def _nearest_header_above(rows, r: int, c: int) -> Optional[str]:
    """SPEC §5.1.1: nearest Text-classified cell above (r, c) in the same column."""
    rr = r - 1
    while rr >= 0:
        v = _cell(rows, rr, c)
        if v == "":
            rr -= 1
            continue
        if classify(v) == "Text":
            return v
        rr -= 1
    return None


def _resolve_year(rows, r: int, c: int) -> str:
    """SPEC §5.1.1: a year *candidate* (already matched _YEAR) is YearData iff
    the column context supports it; otherwise IntNum.
    """
    header = _nearest_header_above(rows, r, c)
    if header is not None:
        return "YearData" if _YEAR_HEADER.search(header) else "IntNum"

    int_siblings = 0
    year_siblings = 0
    for rr in range(len(rows)):
        if rr == r:
            continue
        t = classify(_cell(rows, rr, c))
        if t == "YearData":
            int_siblings += 1
            year_siblings += 1
        elif t == "IntNum":
            int_siblings += 1
    if int_siblings == 0:
        return "IntNum"
    return "YearData" if year_siblings == int_siblings else "IntNum"


def _aggregate(grid: Mapping[str, Any]):
    rows = grid.get("rows", [])
    num_rows = len(rows)
    num_cols = 0
    for row in rows:
        if len(row) > num_cols:
            num_cols = len(row)
    if num_rows == 0 or num_cols == 0:
        return []

    types: List[List[Optional[str]]] = []
    for r in range(num_rows):
        row = rows[r]
        type_row: List[Optional[str]] = []
        for c in range(num_cols):
            value = row[c] if c < len(row) else ""
            type_row.append(classify(value))
        types.append(type_row)

    # SPEC §5.1.1: resolve YearData candidates by column context.
    for r in range(num_rows):
        for c in range(num_cols):
            if types[r][c] == "YearData":
                types[r][c] = _resolve_year(rows, r, c)

    claimed = [[False] * num_cols for _ in range(num_rows)]

    rects = []
    for r in range(num_rows):
        for c in range(num_cols):
            if claimed[r][c]:
                continue
            t = types[r][c]
            if t is None:
                continue

            # Extend right along row r.
            w = 1
            while (
                c + w < num_cols
                and types[r][c + w] == t
                and not claimed[r][c + w]
            ):
                w += 1

            # Extend down: each candidate row must be fully same-type AND
            # unclaimed across [c, c+w).
            h = 1
            while r + h < num_rows:
                ok = True
                for cc in range(c, c + w):
                    if types[r + h][cc] != t or claimed[r + h][cc]:
                        ok = False
                        break
                if not ok:
                    break
                h += 1

            for rr in range(r, r + h):
                for cc in range(c, c + w):
                    claimed[rr][cc] = True

            rects.append((t, r, c, r + h - 1, c + w - 1))

    return rects


def _rect_to_range(rect, origin) -> str:
    t, top, left, bottom, right = rect
    top_left = a1(origin["row"] + top, origin["col"] + left)
    if top == bottom and left == right:
        return top_left
    bottom_right = a1(origin["row"] + bottom, origin["col"] + right)
    return f"{top_left}:{bottom_right}"


def encode_format_aggregation(grid: Mapping[str, Any], token_counter) -> dict:
    rects = _aggregate(grid)
    origin = grid["origin"]

    by_type: "dict[str, list[str]]" = {}
    for rect in rects:
        ranges = by_type.setdefault(rect[0], [])
        ranges.append(_rect_to_range(rect, origin))

    groups = []
    for t in _TYPE_ORDER:
        ranges = by_type.get(t)
        if not ranges:
            continue
        groups.append({"type": t, "ranges": ranges})

    string = "\n".join(f"{g['type']}: {','.join(g['ranges'])}" for g in groups)

    json_obj = {
        "encoding": "format-aggregation",
        "version": 0,
        "origin": {"row": origin["row"], "col": origin["col"]},
        "groups": groups,
    }
    return {"string": string, "json": json_obj, "tokenEstimate": token_counter(string)}
