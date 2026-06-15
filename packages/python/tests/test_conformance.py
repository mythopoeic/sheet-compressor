"""Cross-language conformance: byte-diff against fixtures/corpus/ goldens."""

import json
import os
import unittest

import sys as _sys

_PKG_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _PKG_ROOT not in _sys.path:
    _sys.path.insert(0, _PKG_ROOT)

from sheet_compressor import compress  # noqa: E402
from sheet_compressor.fixtures import GOLDEN_FILES, load_fixtures  # noqa: E402


def _dump(obj) -> str:
    """SPEC §3.3 / §4.5 / §5.4 / §6.2: 2-space indent, trailing newline,
    UTF-8 literal output (no `\\uXXXX` ASCII escapes).
    """
    return json.dumps(obj, indent=2, ensure_ascii=False) + "\n"


def _read_text(path: str) -> str:
    with open(path, "r", encoding="utf-8", newline="") as f:
        return f.read()


def _make_case(fixture):
    class ConformanceCase(unittest.TestCase):
        maxDiff = None
        fx = fixture
        result = compress(fixture["input"])
        golden_dir = os.path.join(fixture["dir"], "golden")

        def _golden(self, key: str) -> str:
            return _read_text(os.path.join(self.golden_dir, GOLDEN_FILES[key]))

        def test_anchor_string(self):
            self.assertEqual(
                self.result["encodings"]["anchor"]["string"],
                self._golden("anchor_string"),
            )

        def test_anchor_json(self):
            self.assertEqual(
                _dump(self.result["encodings"]["anchor"]["json"]),
                self._golden("anchor_json"),
            )

        def test_anchor_tokens(self):
            self.assertEqual(
                str(self.result["encodings"]["anchor"]["tokenEstimate"]),
                self._golden("anchor_tokens").rstrip("\n"),
            )

        def test_inverted_index_string(self):
            self.assertEqual(
                self.result["encodings"]["invertedIndex"]["string"],
                self._golden("inverted_index_string"),
            )

        def test_inverted_index_json(self):
            self.assertEqual(
                _dump(self.result["encodings"]["invertedIndex"]["json"]),
                self._golden("inverted_index_json"),
            )

        def test_inverted_index_tokens(self):
            self.assertEqual(
                str(self.result["encodings"]["invertedIndex"]["tokenEstimate"]),
                self._golden("inverted_index_tokens").rstrip("\n"),
            )

        def test_format_aggregation_string(self):
            self.assertEqual(
                self.result["encodings"]["formatAggregation"]["string"],
                self._golden("format_aggregation_string"),
            )

        def test_format_aggregation_json(self):
            self.assertEqual(
                _dump(self.result["encodings"]["formatAggregation"]["json"]),
                self._golden("format_aggregation_json"),
            )

        def test_format_aggregation_tokens(self):
            self.assertEqual(
                str(self.result["encodings"]["formatAggregation"]["tokenEstimate"]),
                self._golden("format_aggregation_tokens").rstrip("\n"),
            )

        def test_raw_baseline_tokens(self):
            self.assertEqual(
                str(self.result["rawBaseline"]["tokenEstimate"]),
                self._golden("raw_baseline_tokens").rstrip("\n"),
            )

        def test_charts(self):
            self.assertEqual(
                _dump(self.result["charts"]),
                self._golden("charts"),
            )

    ConformanceCase.__name__ = f"Conformance_{fixture['id'].replace('-', '_')}"
    ConformanceCase.__qualname__ = ConformanceCase.__name__
    return ConformanceCase


_fixtures = load_fixtures()
assert _fixtures, "fixtures/corpus/ has no fixtures"

# Generate one TestCase class per fixture so failures attribute to the fixture.
_g = globals()
for _fx in _fixtures:
    _cls = _make_case(_fx)
    _g[_cls.__name__] = _cls
# Don't leave the loop variables in module globals — unittest treats every
# TestCase attribute of the module as a discoverable class, so a leftover `_cls`
# would re-run the last fixture's case under its un-renamed identity.
del _g, _fx, _cls
