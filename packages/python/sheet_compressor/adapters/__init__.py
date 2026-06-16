"""Optional file-format adapters (SPEC §8 / PRD Seam 2).

Each adapter is gated behind an OPTIONAL third-party dependency and produces
the same ``Grid`` shape the pure core (``sheet_compressor.compress``) consumes.
The core stays installable without any of these dependencies.
"""
