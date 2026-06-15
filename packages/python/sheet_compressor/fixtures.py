"""Helpers for loading the shared `fixtures/corpus/` corpus."""

import json
import os
from typing import List


GOLDEN_FILES = {
    "anchor_string": "anchor.string.txt",
    "anchor_json": "anchor.json",
    "anchor_tokens": "anchor.tokenEstimate.txt",
    "inverted_index_string": "invertedIndex.string.txt",
    "inverted_index_json": "invertedIndex.json",
    "inverted_index_tokens": "invertedIndex.tokenEstimate.txt",
    "format_aggregation_string": "formatAggregation.string.txt",
    "format_aggregation_json": "formatAggregation.json",
    "format_aggregation_tokens": "formatAggregation.tokenEstimate.txt",
    "charts": "charts.json",
    "raw_baseline_tokens": "rawBaseline.tokenEstimate.txt",
}


def corpus_root() -> str:
    """Resolve packages/python/sheet_compressor/fixtures.py -> repo root /fixtures/corpus."""
    here = os.path.dirname(os.path.abspath(__file__))
    return os.path.abspath(os.path.join(here, "..", "..", "..", "fixtures", "corpus"))


def load_fixtures(root: str = "") -> List[dict]:
    root = root or corpus_root()
    ids = sorted(
        name
        for name in os.listdir(root)
        if os.path.isdir(os.path.join(root, name))
    )
    out = []
    for fixture_id in ids:
        directory = os.path.join(root, fixture_id)
        with open(os.path.join(directory, "input.json"), "r", encoding="utf-8") as f:
            input_grid = json.load(f)
        with open(os.path.join(directory, "meta.json"), "r", encoding="utf-8") as f:
            meta = json.load(f)
        out.append({"id": fixture_id, "dir": directory, "meta": meta, "input": input_grid})
    return out
