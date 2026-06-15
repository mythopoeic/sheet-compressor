"""Token counting (SPEC §7).

Default heuristic: ceil(utf-16 code units / 4). Optional real-tokenizer factory
using `tiktoken` (declared in `pyproject.toml` under
`project.optional-dependencies.tokenizer`).
"""

import math
from typing import Callable

TokenCounter = Callable[[str], int]


def _utf16_code_units(s: str) -> int:
    """Length of `s` in UTF-16 code units.

    Python's `len(s)` returns code points; a non-BMP character such as
    "\U0001F600" is one code point but two UTF-16 code units. The SPEC §7
    heuristic is defined in UTF-16 units so all language ports agree.
    """
    n = 0
    for ch in s:
        n += 2 if ord(ch) > 0xFFFF else 1
    return n


def estimate_tokens(s: str) -> int:
    """SPEC §7 heuristic: `ceil(utf16-code-units / 4)`, `""` -> 0."""
    if s == "":
        return 0
    return math.ceil(_utf16_code_units(s) / 4)


def create_token_counter(encoding: str = "o200k_base") -> TokenCounter:
    """Return a `TokenCounter` backed by `tiktoken`.

    Defaults to `o200k_base` (GPT-4o / GPT-5 family). Raises a clear error if
    `tiktoken` is not installed.
    """
    try:
        import tiktoken  # type: ignore[import-not-found]
    except ImportError as cause:
        raise ImportError(
            "create_token_counter() requires the optional 'tiktoken' "
            "dependency. Install it with `pip install sheet-compressor[tokenizer]` "
            "or `pip install tiktoken`, or pass a custom token_counter to compress()."
        ) from cause

    enc = tiktoken.get_encoding(encoding)

    def count(s: str) -> int:
        return len(enc.encode(s))

    return count
