"""Release notification locale rules."""

from __future__ import annotations

from typing import Literal

ReleaseLocale = Literal["zh", "en"]


def normalize_release_locale(value: str | None) -> ReleaseLocale:
    if not value:
        return "zh"
    primary = value.split(",", 1)[0].split(";", 1)[0].split("-", 1)[0].strip().lower()
    return "en" if primary == "en" else "zh"
