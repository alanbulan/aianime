"""Shared media-reference duration validation."""

from __future__ import annotations

import math


def _format_seconds(value: float) -> str:
    return f"{value:.3f}".rstrip("0").rstrip(".")


def _exceeds(value: float, limit: float) -> bool:
    return round(value - limit, 3) > 0


def validate_reference_media_durations(
    durations: list[tuple[str, float | None]],
    *,
    min_seconds: float | None,
    max_seconds: float | None,
    total_min_seconds: float | None,
    total_max_seconds: float | None,
    media_label: str,
) -> None:
    measured = [
        (label, float(seconds))
        for label, seconds in durations
        if isinstance(seconds, (int, float))
        and not isinstance(seconds, bool)
        and math.isfinite(seconds)
        and seconds > 0
    ]
    if not measured:
        return

    def clips(items: list[tuple[str, float]]) -> str:
        return ", ".join(
            f"{label} ({_format_seconds(value)}s)" for label, value in items
        )

    if min_seconds is not None:
        too_short = [item for item in measured if _exceeds(min_seconds, item[1])]
        if too_short:
            raise ValueError(
                f"{media_label} reference duration must be >= "
                f"{_format_seconds(min_seconds)}s: " + clips(too_short)
            )
    if max_seconds is not None:
        too_long = [item for item in measured if _exceeds(item[1], max_seconds)]
        if too_long:
            raise ValueError(
                f"{media_label} reference duration must be <= "
                f"{_format_seconds(max_seconds)}s: " + clips(too_long)
            )
    total = sum(value for _, value in measured)
    if (
        total_min_seconds is not None
        and len(measured) == len(durations)
        and _exceeds(total_min_seconds, total)
    ):
        raise ValueError(
            f"{media_label} references total duration must be >= "
            f"{_format_seconds(total_min_seconds)}s, got {_format_seconds(total)}s: "
            + clips(measured)
        )
    if total_max_seconds is not None and _exceeds(total, total_max_seconds):
        raise ValueError(
            f"{media_label} references total duration must be <= "
            f"{_format_seconds(total_max_seconds)}s, got {_format_seconds(total)}s: "
            + clips(measured)
        )
