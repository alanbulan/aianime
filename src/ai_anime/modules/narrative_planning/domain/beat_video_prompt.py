from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal, Mapping

from ai_anime.modules.narrative_planning.domain.script_beat import (
    BeatPayload,
    select_script_beat_context,
)


class FinalBeatTransitionNotAllowed(ValueError):
    pass


PromptField = Literal["video_prompt", "keyframe_prompt"]


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
    selection = select_script_beat_context(script, beat_num)
    field: PromptField = (
        "keyframe_prompt"
        if str(selection.beat.get("video_mode") or "first_frame") == "keyframe"
        else "video_prompt"
    )
    if field == "keyframe_prompt" and selection.next_beat is None:
        raise FinalBeatTransitionNotAllowed(
            "这是最后一个 Beat，无法生成首尾帧过渡提示词"
        )

    return BeatVideoPromptSelection(
        beats=selection.beats,
        beat=selection.beat,
        previous_beat=selection.previous_beat,
        next_beat=selection.next_beat,
        field=field,
    )
