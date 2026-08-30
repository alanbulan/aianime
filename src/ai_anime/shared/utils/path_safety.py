"""Cross-platform sanitizers for user-controlled path components."""

from __future__ import annotations

import re

_PATH_SEPARATOR_RUN = re.compile(r"[/\\]+")
_WINDOWS_HOSTILE_RUN = re.compile(r'[\x00-\x1f<>:"/\\|?*]+')


def sanitize_path_component(value: str | None, *, fallback: str) -> str:
    """Return one portable path component while preserving Unicode text."""

    safe = _WINDOWS_HOSTILE_RUN.sub("_", str(value or "").strip())
    safe = safe.strip().strip(".")
    return safe or fallback


def sanitize_filename(value: str | None, *, fallback: str) -> str:
    """Return a portable basename for a path supplied by any client OS."""

    basename = _PATH_SEPARATOR_RUN.split(str(value or ""))[-1].strip()
    safe = _WINDOWS_HOSTILE_RUN.sub("_", basename).rstrip(" .")
    if not safe or safe in {".", ".."}:
        return fallback
    return safe


__all__ = ["sanitize_filename", "sanitize_path_component"]
