from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal, Mapping


class ScriptNotFound(LookupError):
    pass


class BeatNotFound(LookupError):
    pass


class FinalBeatTransitionNotAllowed(ValueError):
    pass


PromptField = Literal["video_prompt", "keyframe_prompt"]
BeatPayload = dict[str, Any]


@dataclass(frozen=True)
class BeatVideoPromptSelection:
    beats: tuple[BeatPayload, ...]
    beat: BeatPayload
    previous_beat: BeatPayload | None
    next_beat: BeatPayload | None
    field: PromptField


def select_beat_video_prompt_target(
    script: Mapping[str, Any] | None,
    beat_num: int,
) -> BeatVideoPromptSelection:
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
    field: PromptField = (
        "keyframe_prompt"
        if str(beat.get("video_mode") or "first_frame") == "keyframe"
        else "video_prompt"
    )
    if field == "keyframe_prompt" and next_beat is None:
        raise FinalBeatTransitionNotAllowed(
            "这是最后一个 Beat，无法生成首尾帧过渡提示词"
        )

    return BeatVideoPromptSelection(
        beats=beats,
        beat=beat,
        previous_beat=previous_beat,
        next_beat=next_beat,
        field=field,
    )
