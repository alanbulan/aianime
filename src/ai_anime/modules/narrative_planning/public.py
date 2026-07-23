"""Stable application API exposed by Narrative Planning."""

from pathlib import Path

from ai_anime.modules.narrative_planning.application.beat_video_prompts import (
    GeneratedBeatVideoPrompt,
)
from ai_anime.modules.narrative_planning.application.literal_script_writing import (
    LiteralBeatMetaOutput,
    LiteralScriptWritingWorkflow,
    SceneBlock,
    split_literal_source_text,
)
from ai_anime.modules.narrative_planning.application.ports import (
    NarrativeScriptStore,
)
from ai_anime.modules.narrative_planning.composition import (
    beat_video_prompts,
    create_script_writing_workflow,
)
from ai_anime.modules.narrative_planning.domain import (
    BeatNotFound,
    BeatVideoPromptSelection,
    FinalBeatTransitionNotAllowed,
    ScriptNotFound,
)


async def resolve_beat_video_prompt_target(
    store: NarrativeScriptStore,
    *,
    episode_num: int,
    beat_num: int,
) -> BeatVideoPromptSelection:
    return await beat_video_prompts().resolve_target(
        store,
        episode_num=episode_num,
        beat_num=beat_num,
    )


async def generate_and_save_beat_video_prompt(
    store: NarrativeScriptStore,
    *,
    output_dir: str | Path,
    project_name: str = "",
    episode_num: int,
    beat_num: int,
    language: str,
) -> GeneratedBeatVideoPrompt:
    return await beat_video_prompts().generate_and_save(
        store,
        output_dir=output_dir,
        project_name=project_name,
        episode_num=episode_num,
        beat_num=beat_num,
        language=language,
    )


__all__ = [
    "BeatNotFound",
    "BeatVideoPromptSelection",
    "FinalBeatTransitionNotAllowed",
    "GeneratedBeatVideoPrompt",
    "LiteralBeatMetaOutput",
    "LiteralScriptWritingWorkflow",
    "SceneBlock",
    "ScriptNotFound",
    "create_script_writing_workflow",
    "generate_and_save_beat_video_prompt",
    "resolve_beat_video_prompt_target",
    "split_literal_source_text",
]
