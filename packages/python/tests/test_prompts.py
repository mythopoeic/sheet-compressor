"""SPEC §10.3: prompts.* must equal the on-disk shared source byte-for-byte."""

import os
import sys
import unittest

_PKG_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _PKG_ROOT not in sys.path:
    sys.path.insert(0, _PKG_ROOT)

from sheet_compressor import prompts  # noqa: E402

_REPO_PROMPTS = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..", "prompts")
)


def _read(relpath: str) -> str:
    with open(os.path.join(_REPO_PROMPTS, relpath), "r", encoding="utf-8", newline="") as f:
        return f.read()


class PromptByteEquality(unittest.TestCase):
    maxDiff = None

    def test_readers_anchor(self):
        self.assertEqual(prompts.readers.anchor, _read("readers/anchor.md"))

    def test_readers_inverted_index(self):
        self.assertEqual(
            prompts.readers.invertedIndex, _read("readers/invertedIndex.md")
        )

    def test_readers_format_aggregation(self):
        self.assertEqual(
            prompts.readers.formatAggregation, _read("readers/formatAggregation.md")
        )

    def test_tasks_table_region_detection(self):
        self.assertEqual(
            prompts.tasks.tableRegionDetection,
            _read("tasks/tableRegionDetection.md"),
        )

    def test_tasks_cell_value_lookup(self):
        self.assertEqual(
            prompts.tasks.cellValueLookup, _read("tasks/cellValueLookup.md")
        )

    def test_tasks_sheet_qa(self):
        self.assertEqual(prompts.tasks.sheetQA, _read("tasks/sheetQA.md"))

    def test_snippets_chart_descriptor(self):
        self.assertEqual(
            prompts.snippets.chartDescriptor, _read("snippets/chartDescriptor.md")
        )
