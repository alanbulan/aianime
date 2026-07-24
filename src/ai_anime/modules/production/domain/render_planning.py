"""Pure values and validation rules for server-authoritative Render plans."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class RenderPlanGrid:
    mode_key: str
    rows: int
    cols: int
    beat_numbers: tuple[int, ...]
    location: str = ""
    padding_count: int = 0
    reasons: tuple[str, ...] = ()
    warnings: tuple[str, ...] = ()

    def as_dict(self) -> dict[str, Any]:
        return {
            "mode_key": self.mode_key,
            "rows": self.rows,
            "cols": self.cols,
            "beat_numbers": list(self.beat_numbers),
            "location": self.location,
            "padding_count": self.padding_count,
            "reasons": list(self.reasons),
            "warnings": list(self.warnings),
        }


def normalize_render_beat_numbers(beat_numbers: tuple[int, ...]) -> tuple[int, ...]:
    normalized: list[int] = []
    seen: set[int] = set()
    for beat_number in beat_numbers:
        value = int(beat_number)
        if value in seen:
            continue
        normalized.append(value)
        seen.add(value)
    return tuple(normalized)


def invalid_render_beat_numbers(
    all_beats: list[dict[str, Any]],
    beat_numbers: tuple[int, ...],
) -> tuple[int, ...]:
    valid_beat_numbers = {
        int(beat.get("beat_number", 0) or 0) for beat in all_beats
    }
    return tuple(
        int(beat_number)
        for beat_number in beat_numbers
        if int(beat_number) not in valid_beat_numbers
    )


def custom_render_plan_error(
    plan: tuple[RenderPlanGrid, ...],
    beat_numbers: tuple[int, ...],
) -> str | None:
    flattened: list[int] = []
    seen: set[int] = set()
    for entry in plan:
        if not entry.beat_numbers:
            return "empty_grid"
        if entry.rows * entry.cols < len(entry.beat_numbers):
            return "grid_capacity"
        for beat_number in entry.beat_numbers:
            if beat_number in seen:
                return "duplicate_beat"
            seen.add(beat_number)
            flattened.append(beat_number)
    if set(flattened) != set(beat_numbers) or len(flattened) != len(beat_numbers):
        return "beat_mismatch"
    return None
