"""Structural-anchor skeleton encoding (SPEC §3)."""

from typing import Any, Mapping

from ..address import a1
from .escape import escape_value


def encode_anchor(
    grid: Mapping[str, Any],
    detection: Mapping[str, set],
    token_counter,
) -> dict:
    rows = grid.get("rows", [])
    origin = grid["origin"]
    kept_rows = detection["kept_rows"]
    kept_cols = detection["kept_cols"]

    cells = []
    lines = []
    for r in range(len(rows)):
        if r not in kept_rows:
            continue
        row = rows[r]
        tokens = []
        for c in range(len(row)):
            if c not in kept_cols:
                continue
            value = row[c]
            # SPEC §3.1: only literal "" is empty.
            if value == "":
                continue
            address = a1(origin["row"] + r, origin["col"] + c)
            cells.append({"address": address, "value": value})
            tokens.append(f"{address},{escape_value(value)}")
        if tokens:
            lines.append("|".join(tokens))

    string = "\n".join(lines)
    json_obj = {
        "encoding": "anchor-skeleton",
        "version": 0,
        "origin": {"row": origin["row"], "col": origin["col"]},
        "cells": cells,
    }
    return {"string": string, "json": json_obj, "tokenEstimate": token_counter(string)}
