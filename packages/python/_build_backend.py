"""In-tree PEP 517 build backend (SPEC §10).

The shared prompt templates live once at the repo root in ``prompts/``; the
Python package loads them from disk at import time. A published wheel/sdist must
therefore carry its own copy. This thin backend vendors ``prompts/`` into
``sheet_compressor/prompts/`` just before building, then delegates everything to
setuptools — so ``python -m build`` is self-contained and we never commit a
duplicate of the canonical prompts (the vendored copy is git-ignored).

When pip builds a wheel from an unpacked sdist, the canonical tree is absent but
the prompts are already vendored inside the sdist, so vendoring is skipped.
"""

import os
import shutil

from setuptools import build_meta as _bm

# Pass-through hooks PEP 517 front-ends may call.
get_requires_for_build_wheel = _bm.get_requires_for_build_wheel
get_requires_for_build_sdist = _bm.get_requires_for_build_sdist
prepare_metadata_for_build_wheel = _bm.prepare_metadata_for_build_wheel
try:  # editable-install hooks (setuptools >= 64)
    get_requires_for_build_editable = _bm.get_requires_for_build_editable
    prepare_metadata_for_build_editable = _bm.prepare_metadata_for_build_editable
except AttributeError:  # pragma: no cover
    pass

_HERE = os.path.dirname(os.path.abspath(__file__))
_CANONICAL = os.path.join(_HERE, "..", "..", "prompts")
_VENDOR = os.path.join(_HERE, "sheet_compressor", "prompts")


def _vendor_prompts() -> None:
    if os.path.isdir(_CANONICAL):
        if os.path.isdir(_VENDOR):
            shutil.rmtree(_VENDOR)
        shutil.copytree(_CANONICAL, _VENDOR)


def build_sdist(sdist_directory, config_settings=None):
    _vendor_prompts()
    return _bm.build_sdist(sdist_directory, config_settings)


def build_wheel(wheel_directory, config_settings=None, metadata_directory=None):
    _vendor_prompts()
    return _bm.build_wheel(wheel_directory, config_settings, metadata_directory)


def build_editable(wheel_directory, config_settings=None, metadata_directory=None):
    _vendor_prompts()
    return _bm.build_editable(wheel_directory, config_settings, metadata_directory)
