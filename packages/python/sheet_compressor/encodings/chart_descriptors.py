"""Chart-descriptor rendering (SPEC §6)."""

from typing import Any, List, Mapping, Optional


def _escape_quoted(s: str) -> str:
    """SPEC §6.1: double-quoted token field (title, xAxis, yAxis)."""
    return (
        s.replace("\\", "\\\\")
        .replace('"', '\\"')
        .replace("\n", "\\n")
        .replace("\r", "\\r")
        .replace("\t", "\\t")
    )


def _escape_series_name(s: str) -> str:
    """SPEC §6.1: a single series name inside `series=[…]`."""
    return (
        s.replace("\\", "\\\\")
        .replace(",", "\\,")
        .replace("]", "\\]")
        .replace("\n", "\\n")
        .replace("\r", "\\r")
        .replace("\t", "\\t")
    )


def render_chart_token(chart: Mapping[str, Any]) -> str:
    """SPEC §6.1: render one descriptor. `name` is NOT rendered."""
    parts: List[str] = [f"CHART({chart['type']})@{chart['anchorRange']}"]
    title = chart.get("title")
    if title is not None:
        parts.append(f'title="{_escape_quoted(title)}"')
    data_ranges = chart.get("dataRanges")
    if data_ranges:
        parts.append(f"data={','.join(data_ranges)}")
    series = chart.get("series")
    if series:
        parts.append("series=[" + ",".join(_escape_series_name(s) for s in series) + "]")
    axes = chart.get("axes") or {}
    x_axis = axes.get("x")
    if x_axis is not None:
        parts.append(f'xAxis="{_escape_quoted(x_axis)}"')
    y_axis = axes.get("y")
    if y_axis is not None:
        parts.append(f'yAxis="{_escape_quoted(y_axis)}"')
    return " ".join(parts)


def render_chart_block(charts: Optional[List[Mapping[str, Any]]]) -> str:
    """SPEC §6.2: tokens joined by `\\n` in input order. `""` when missing/empty."""
    if not charts:
        return ""
    return "\n".join(render_chart_token(c) for c in charts)


def append_chart_block(cell_string: str, chart_block: str) -> str:
    """SPEC §6.2: combine an encoding's cell-string with the chart block."""
    if chart_block == "":
        return cell_string
    if cell_string == "":
        return chart_block
    return f"{cell_string}\n{chart_block}"
