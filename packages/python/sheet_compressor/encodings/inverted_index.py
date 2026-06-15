"""Inverted-index encoding (SPEC §4)."""

from typing import Any, Mapping

from ..address import a1
from .escape import escape_value


def encode_inverted_index(grid: Mapping[str, Any], token_counter) -> dict:
    rows = grid.get("rows", [])
    origin = grid["origin"]

    # Walk in row-major order, bucketing every non-empty cell by value.
    # `dict` preserves insertion order (Python 3.7+), so iterating later yields
    # values ordered by first cell address — exactly the order SPEC §4.4 wants.
    cells_by_value: "dict[str, list[tuple[int, int]]]" = {}
    for r in range(len(rows)):
        row = rows[r]
        for c in range(len(row)):
            value = row[c]
            if value == "":
                continue
            abs_row = origin["row"] + r
            abs_col = origin["col"] + c
            bucket = cells_by_value.get(value)
            if bucket is None:
                cells_by_value[value] = [(abs_row, abs_col)]
            else:
                bucket.append((abs_row, abs_col))

    groups = []
    for value, cell_coords in cells_by_value.items():
        present = set(cell_coords)
        assigned: set = set()
        ranges = []
        for start in cell_coords:
            if start in assigned:
                continue
            start_row, start_col = start

            # Maximum width: extend right while in the value-set and unassigned.
            width = 1
            while (
                (start_row, start_col + width) in present
                and (start_row, start_col + width) not in assigned
            ):
                width += 1

            # Maximum height: every cell of the next row of `width` cells must
            # still be in the value-set and unassigned.
            height = 1
            while True:
                next_row = start_row + height
                can_extend = True
                for dc in range(width):
                    k = (next_row, start_col + dc)
                    if k not in present or k in assigned:
                        can_extend = False
                        break
                if not can_extend:
                    break
                height += 1

            for dr in range(height):
                for dc in range(width):
                    assigned.add((start_row + dr, start_col + dc))

            top_left = a1(start_row, start_col)
            if width == 1 and height == 1:
                ranges.append(top_left)
            else:
                bottom_right = a1(start_row + height - 1, start_col + width - 1)
                ranges.append(f"{top_left}:{bottom_right}")

        groups.append({"value": value, "ranges": ranges})

    string = "\n".join(
        f"{'|'.join(g['ranges'])},{escape_value(g['value'])}" for g in groups
    )

    json_obj = {
        "encoding": "inverted-index",
        "version": 0,
        "origin": {"row": origin["row"], "col": origin["col"]},
        "groups": groups,
    }
    return {"string": string, "json": json_obj, "tokenEstimate": token_counter(string)}
