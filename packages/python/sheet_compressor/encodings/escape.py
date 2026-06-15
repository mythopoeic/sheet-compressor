"""SPEC §3.2 / §4.4 value-escaping rules."""


def escape_value(v: str) -> str:
    """Backslash first (so later rules don't double-escape), then delimiters,
    then whitespace controls.
    """
    return (
        v.replace("\\", "\\\\")
        .replace(",", "\\,")
        .replace("|", "\\|")
        .replace("\n", "\\n")
        .replace("\r", "\\r")
        .replace("\t", "\\t")
    )
