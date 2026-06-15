"""Prompt-template mirror of the shared `prompts/` source (SPEC §10).

Loaded from disk once at import time, byte-for-byte identical to the canonical
files under `prompts/` at the repo root. To change a prompt, edit the file
there — never inline it here.
"""

import os
from typing import List


def _candidate_roots() -> List[str]:
    here = os.path.dirname(os.path.abspath(__file__))
    return [
        # Sibling-of-package layout (mirrored copy, used by a published wheel
        # that ships `prompts/` alongside the package).
        os.path.join(here, "prompts"),
        # In-repo monorepo layout: packages/python/sheet_compressor/ -> repo root
        # -> `prompts/`.
        os.path.join(here, "..", "..", "..", "prompts"),
    ]


def _prompts_root() -> str:
    for d in _candidate_roots():
        if os.path.isfile(os.path.join(d, "readers", "anchor.md")):
            return d
    raise FileNotFoundError(
        "sheet-compressor: prompts/ not found; searched "
        + ", ".join(_candidate_roots())
    )


_ROOT = _prompts_root()


def _read(relpath: str) -> str:
    # SPEC §3.3 / §10.2: read as UTF-8 literal; no transcoding.
    with open(os.path.join(_ROOT, relpath), "r", encoding="utf-8", newline="") as f:
        return f.read()


class _Readers:
    anchor = _read("readers/anchor.md")
    invertedIndex = _read("readers/invertedIndex.md")
    formatAggregation = _read("readers/formatAggregation.md")


class _Tasks:
    tableRegionDetection = _read("tasks/tableRegionDetection.md")
    cellValueLookup = _read("tasks/cellValueLookup.md")
    sheetQA = _read("tasks/sheetQA.md")


class _Snippets:
    chartDescriptor = _read("snippets/chartDescriptor.md")


class _Prompts:
    readers = _Readers
    tasks = _Tasks
    snippets = _Snippets


prompts = _Prompts
