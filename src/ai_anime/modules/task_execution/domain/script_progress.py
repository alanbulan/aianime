"""Script workflow progress rules."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any


def beat_has_script_content(beat: Mapping[str, Any]) -> bool:
    return bool(
        str(beat.get("narration_segment") or "").strip()
        or str(beat.get("narration") or "").strip()
        or str(beat.get("visual_description") or "").strip()
    )


def script_beats_complete(
    beats: Sequence[Mapping[str, Any]],
    target_beats: int | None,
) -> bool:
    return (
        bool(beats)
        and (target_beats is None or len(beats) == target_beats)
        and all(beat_has_script_content(beat) for beat in beats)
    )


__all__ = ["beat_has_script_content", "script_beats_complete"]
