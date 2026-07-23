from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping


class ScriptNotFound(LookupError):
    pass


class BeatNotFound(LookupError):
    pass


BeatPayload = dict[str, Any]


@dataclass(frozen=True)
class ScriptBeatSelection:
    beats: tuple[BeatPayload, ...]
    beat: BeatPayload
    previous_beat: BeatPayload | None
    next_beat: BeatPayload | None


def select_script_beat_context(
    script: Mapping[str, Any] | None,
    beat_num: int,
) -> ScriptBeatSelection:
    if not script:
        raise ScriptNotFound("Script not found")

    beats = tuple(script.get("beats") or ())
    beat = next(
        (item for item in beats if int(item.get("beat_number") or 0) == beat_num),
        None,
    )
    if beat is None:
        raise BeatNotFound(f"Beat {beat_num} not found")

    previous_beat = next(
        (
            item
            for item in beats
            if int(item.get("beat_number") or 0) == beat_num - 1
        ),
        None,
    )
    next_beat = next(
        (
            item
            for item in beats
            if int(item.get("beat_number") or 0) == beat_num + 1
        ),
        None,
    )
    return ScriptBeatSelection(
        beats=beats,
        beat=beat,
        previous_beat=previous_beat,
        next_beat=next_beat,
    )
