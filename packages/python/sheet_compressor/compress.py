"""Top-level `compress()` (SPEC §2 / §6.2)."""

import copy
from typing import Any, Mapping, Optional

from .baseline import vanilla_encode
from .encodings.anchor import encode_anchor
from .encodings.chart_descriptors import append_chart_block, render_chart_block
from .encodings.format_aggregation import encode_format_aggregation
from .encodings.inverted_index import encode_inverted_index
from .strategies import resolve_strategy
from .tokens import estimate_tokens


def _with_charts(encoding: dict, chart_block: str, token_counter) -> dict:
    """SPEC §6.2: extend `.string` with the chart block, re-measure tokens.
    `.json` is unchanged — chart data only lives in the string + top-level echo.
    """
    if chart_block == "":
        return encoding
    string = append_chart_block(encoding["string"], chart_block)
    return {
        "string": string,
        "json": encoding["json"],
        "tokenEstimate": token_counter(string),
    }


def compress(
    grid: Mapping[str, Any],
    options: Optional[Mapping[str, Any]] = None,
) -> dict:
    """Compress a single sheet. See SPEC §2 for the result contract."""
    options = options or {}
    strategy = resolve_strategy(options.get("anchorStrategy"))
    detection = strategy.detect(grid)
    token_counter = options.get("tokenCounter") or estimate_tokens
    chart_block = render_chart_block(grid.get("charts"))

    anchor = _with_charts(
        encode_anchor(grid, detection, token_counter), chart_block, token_counter
    )
    inverted = _with_charts(
        encode_inverted_index(grid, token_counter), chart_block, token_counter
    )
    formats = _with_charts(
        encode_format_aggregation(grid, token_counter), chart_block, token_counter
    )

    charts = [copy.deepcopy(c) for c in (grid.get("charts") or [])]

    return {
        "encodings": {
            "anchor": anchor,
            "invertedIndex": inverted,
            "formatAggregation": formats,
        },
        "charts": charts,
        "rawBaseline": {"tokenEstimate": token_counter(vanilla_encode(grid))},
    }
