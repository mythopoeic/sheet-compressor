"""Pluggable anchor-detection strategies (SPEC §3.1)."""

import re
from typing import Any, Callable, Mapping, Set, Tuple, Union

# SPEC §3.1: Phase-1 neighborhood window radius.
PHASE1_K = 4
# SPEC §3.1: Phase-1 heterogeneity threshold (unique / non-empty).
PHASE1_HET_THRESHOLD = 0.5

# SPEC §3.1: strict decimal regex so every language agrees byte-for-byte.
_NUMERIC_RE = re.compile(r"^-?\d+(\.\d+)?$")


class AnchorDetection(dict):
    """Result of an anchor-detection run: which row/col indices to keep.

    Subclasses `dict` so it interoperates with the SPEC's plain-mapping output
    contract while still keeping the explicit `kept_rows` / `kept_cols` aliases.
    """


def _grid_dimensions(grid: Mapping[str, Any]) -> Tuple[int, int]:
    rows = grid.get("rows", [])
    row_count = len(rows)
    col_count = 0
    for row in rows:
        if len(row) > col_count:
            col_count = len(row)
    return row_count, col_count


def _infer_type(value: str) -> str:
    if value == "":
        return "empty"
    if _NUMERIC_RE.match(value):
        return "number"
    return "text"


def _cell(rows, r: int, c: int) -> str:
    if r < 0 or r >= len(rows):
        return ""
    row = rows[r]
    if c < 0 or c >= len(row):
        return ""
    return row[c]


def _cell_type(grid: Mapping[str, Any], r: int, c: int) -> str:
    cell_meta = grid.get("cellMeta")
    if cell_meta is not None and r < len(cell_meta):
        meta_row = cell_meta[r]
        if meta_row is not None and c < len(meta_row):
            entry = meta_row[c]
            if entry is not None:
                explicit = entry.get("dataType")
                if explicit:
                    return explicit
    return _infer_type(_cell(grid["rows"], r, c))


def _heterogeneity(values) -> float:
    non_empty = 0
    seen: Set[str] = set()
    for v in values:
        if v == "":
            continue
        non_empty += 1
        seen.add(v)
    if non_empty == 0:
        return 0.0
    return len(seen) / non_empty


def _expand_neighborhood(anchors, size: int, k: int) -> Set[int]:
    kept: Set[int] = set()
    for a in anchors:
        lo = max(0, a - k)
        hi = min(size - 1, a + k)
        for i in range(lo, hi + 1):
            kept.add(i)
    return kept


def keep_all_detect(grid: Mapping[str, Any]) -> AnchorDetection:
    """SPEC §3.1.1: legacy "keep every cell" policy."""
    row_count, col_count = _grid_dimensions(grid)
    return AnchorDetection(
        kept_rows=set(range(row_count)),
        kept_cols=set(range(col_count)),
    )


def phase1_detect(grid: Mapping[str, Any]) -> AnchorDetection:
    """SPEC §3.1.2: Phase-1 grid-only structural-anchor detector."""
    row_count, col_count = _grid_dimensions(grid)
    if row_count == 0 or col_count == 0:
        return AnchorDetection(kept_rows=set(), kept_cols=set())

    rows = grid["rows"]

    anchor_rows: Set[int] = set()
    for r in range(row_count):
        values = [_cell(rows, r, c) for c in range(col_count)]
        if _heterogeneity(values) >= PHASE1_HET_THRESHOLD:
            anchor_rows.add(r)
    for r in range(1, row_count):
        for c in range(col_count):
            if _cell_type(grid, r - 1, c) != _cell_type(grid, r, c):
                anchor_rows.add(r - 1)
                anchor_rows.add(r)
                break

    anchor_cols: Set[int] = set()
    for c in range(col_count):
        values = [_cell(rows, r, c) for r in range(row_count)]
        if _heterogeneity(values) >= PHASE1_HET_THRESHOLD:
            anchor_cols.add(c)
    for c in range(1, col_count):
        for r in range(row_count):
            if _cell_type(grid, r, c - 1) != _cell_type(grid, r, c):
                anchor_cols.add(c - 1)
                anchor_cols.add(c)
                break

    kept_rows = _expand_neighborhood(anchor_rows, row_count, PHASE1_K)
    kept_cols = _expand_neighborhood(anchor_cols, col_count, PHASE1_K)

    # Prune entirely-blank rows/cols within the kept region (rows first).
    for r in list(kept_rows):
        if all(_cell(rows, r, c) == "" for c in kept_cols):
            kept_rows.discard(r)
    for c in list(kept_cols):
        if all(_cell(rows, r, c) == "" for r in kept_rows):
            kept_cols.discard(c)

    return AnchorDetection(kept_rows=kept_rows, kept_cols=kept_cols)


class AnchorStrategy:
    """Pluggable strategy (SPEC §3.1). Wraps a `detect` callable + a name."""

    def __init__(self, name: str, detect: Callable[[Mapping[str, Any]], AnchorDetection]):
        self.name = name
        self._detect = detect

    def detect(self, grid: Mapping[str, Any]) -> AnchorDetection:
        return self._detect(grid)


keep_all_strategy = AnchorStrategy("keep-all", keep_all_detect)
phase1_strategy = AnchorStrategy("phase1", phase1_detect)


def resolve_strategy(
    s: Union[str, AnchorStrategy, None],
) -> AnchorStrategy:
    if s is None:
        return phase1_strategy
    if isinstance(s, str):
        if s == "keep-all":
            return keep_all_strategy
        if s == "phase1":
            return phase1_strategy
        raise ValueError(f"unknown anchor strategy name: {s!r}")
    return s
