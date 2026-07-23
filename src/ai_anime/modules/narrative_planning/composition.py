from __future__ import annotations

from typing import Any

from ai_anime.modules.narrative_planning.application.beat_video_prompts import (
    BeatVideoPrompts,
)
from ai_anime.modules.narrative_planning.application.literal_script_writing import (
    LiteralScriptWritingWorkflow,
)
from ai_anime.modules.narrative_planning.infrastructure import (
    beat_prompt_generators,
)


def beat_video_prompts() -> BeatVideoPrompts:
    return BeatVideoPrompts(
        first_frame_generator=(
            beat_prompt_generators.generate_single_beat_video_prompt
        ),
        keyframe_generator=(
            beat_prompt_generators.generate_single_beat_keyframe_prompt
        ),
    )


def create_script_writing_workflow(
    cognee_store: Any,
    visual_style: str = "",
    genre: str = "",
    story_setting: str = "",
    spine_template: str = "drama",
) -> LiteralScriptWritingWorkflow:
    del visual_style, genre, story_setting
    audio_type_mode = "narrated" if spine_template == "narrated" else "literal"
    return LiteralScriptWritingWorkflow(
        cognee_store=cognee_store,
        sqlite_store=cognee_store,
        output_dir=getattr(cognee_store, "output_dir", ""),
        audio_type_mode=audio_type_mode,
    )
