"""SPEC §7: heuristic counter; injection seam."""

import os
import sys
import unittest

_PKG_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _PKG_ROOT not in sys.path:
    sys.path.insert(0, _PKG_ROOT)

from sheet_compressor import compress, estimate_tokens  # noqa: E402


class HeuristicCounter(unittest.TestCase):
    def test_empty(self):
        self.assertEqual(estimate_tokens(""), 0)

    def test_ascii_round_up(self):
        # "abcde" = 5 utf-16 units; ceil(5/4) = 2
        self.assertEqual(estimate_tokens("abcde"), 2)

    def test_non_bmp_two_code_units(self):
        # U+1F600 ("😀") is one code point but two UTF-16 code units.
        # SPEC §7: tokens("😀") = ceil(2/4) = 1; "😀😀" = ceil(4/4) = 1.
        self.assertEqual(estimate_tokens("😀"), 1)
        self.assertEqual(estimate_tokens("😀😀"), 1)

    def test_cjk_one_code_unit_each(self):
        # CJK in the BMP is one UTF-16 unit per code point.
        # "日本語" = 3 units; ceil(3/4) = 1.
        self.assertEqual(estimate_tokens("日本語"), 1)


class TokenCounterInjection(unittest.TestCase):
    def test_custom_counter_is_used(self):
        calls = []

        def always_seven(s: str) -> int:
            calls.append(s)
            return 7

        grid = {
            "rows": [["a", "b"], ["c", "d"]],
            "origin": {"row": 1, "col": 1},
        }
        result = compress(grid, {"tokenCounter": always_seven})
        self.assertEqual(result["encodings"]["anchor"]["tokenEstimate"], 7)
        self.assertEqual(result["encodings"]["invertedIndex"]["tokenEstimate"], 7)
        self.assertEqual(result["encodings"]["formatAggregation"]["tokenEstimate"], 7)
        self.assertEqual(result["rawBaseline"]["tokenEstimate"], 7)
        # 1 raw-baseline + 3 encoding strings (no charts → no second pass).
        self.assertEqual(len(calls), 4)


class KeepAllStrategy(unittest.TestCase):
    def test_keep_all_emits_every_non_empty_cell(self):
        grid = {
            "rows": [["A", ""], ["", "D"]],
            "origin": {"row": 1, "col": 1},
        }
        # phase1 would prune the blank row/col; keep-all does not.
        result = compress(grid, {"anchorStrategy": "keep-all"})
        self.assertEqual(result["encodings"]["anchor"]["string"], "A1,A\nB2,D")
