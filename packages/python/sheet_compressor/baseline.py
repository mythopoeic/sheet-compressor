"""Vanilla raw-baseline encoding. See SPEC §7."""

from typing import Any, Mapping


def vanilla_encode(grid: Mapping[str, Any]) -> str:
    """Un-compressed baseline: rows joined with ' | ', separated by '\\n'."""
    rows = grid.get("rows", [])
    return "\n".join(" | ".join(row) for row in rows)
