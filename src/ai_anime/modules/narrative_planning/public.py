"""Stable application API exposed by Narrative Planning."""

from pathlib import Path
from typing import Any

from ai_anime.modules.narrative_planning.application.beat_video_prompts import (
    GeneratedBeatVideoPrompt,
)
from ai_anime.modules.narrative_planning.application.episode_content import (
    ClearedEpisodeContent,
    EpisodeContentDocument,
    EpisodeContentWriteFailed,
    GenerateEpisodeRewriteCommand,
    GeneratedEpisodeRewrite,
    SavedEpisodeContent,
)
from ai_anime.modules.narrative_planning.application.literal_script_writing import (
    LiteralBeatMetaOutput,
    LiteralScriptWritingWorkflow,
    SceneBlock,
    split_literal_source_text,
)
from ai_anime.modules.narrative_planning.application.ports import (
    NarrativeContentStore,
    NarrativeScriptStore,
    ScriptDocumentStore,
)
from ai_anime.modules.narrative_planning.application.script_documents import (
    BeatStoreUpdateFailed,
    SavedEpisodeScript,
    ScriptStoreSyncFailed,
)
from ai_anime.modules.narrative_planning.composition import (
    beat_video_prompts,
    create_script_writing_workflow,
    episode_content_service,
    script_document_service,
)
from ai_anime.modules.narrative_planning.domain import (
    BeatNotFound,
    BeatVideoPromptSelection,
    FinalBeatTransitionNotAllowed,
    RawEpisodeContentMissing,
    ScriptNotFound,
)


async def load_raw_episode_content(
    store: NarrativeContentStore,
    episode_num: int,
) -> EpisodeContentDocument:
    return await episode_content_service().load_raw(store, episode_num)


async def save_raw_episode_content(
    store: NarrativeContentStore,
    episode_num: int,
    content: str,
) -> SavedEpisodeContent:
    return await episode_content_service().save_raw(store, episode_num, content)


async def load_adapted_episode_content(
    store: NarrativeContentStore,
    episode_num: int,
) -> EpisodeContentDocument:
    return await episode_content_service().load_adapted(store, episode_num)


async def save_adapted_episode_content(
    store: NarrativeContentStore,
    episode_num: int,
    content: str,
) -> SavedEpisodeContent:
    return await episode_content_service().save_adapted(store, episode_num, content)


async def clear_adapted_episode_content(
    store: NarrativeContentStore,
    episode_num: int,
) -> ClearedEpisodeContent:
    return await episode_content_service().clear_adapted(store, episode_num)


async def generate_episode_rewrite(
    store: NarrativeContentStore,
    command: GenerateEpisodeRewriteCommand,
) -> GeneratedEpisodeRewrite:
    return await episode_content_service().generate_rewrite(store, command)


async def load_episode_script(
    store: ScriptDocumentStore,
    episode_num: int,
) -> dict[str, Any] | None:
    return await script_document_service().load(store, episode_num)


async def update_episode_script_beat(
    store: ScriptDocumentStore,
    *,
    episode_num: int,
    beat_num: int,
    updates: dict[str, Any],
) -> dict[str, Any]:
    return await script_document_service().update_beat(
        store,
        episode_num=episode_num,
        beat_num=beat_num,
        updates=updates,
    )


async def save_episode_script(
    store: ScriptDocumentStore,
    *,
    episode_num: int,
    beats: list[dict[str, Any]],
) -> SavedEpisodeScript:
    return await script_document_service().save(
        store,
        episode_num=episode_num,
        beats=beats,
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
    "BeatStoreUpdateFailed",
    "BeatVideoPromptSelection",
    "ClearedEpisodeContent",
    "EpisodeContentDocument",
    "EpisodeContentWriteFailed",
    "FinalBeatTransitionNotAllowed",
    "GenerateEpisodeRewriteCommand",
    "GeneratedEpisodeRewrite",
    "GeneratedBeatVideoPrompt",
    "LiteralBeatMetaOutput",
    "LiteralScriptWritingWorkflow",
    "SceneBlock",
    "SavedEpisodeContent",
    "SavedEpisodeScript",
    "RawEpisodeContentMissing",
    "ScriptNotFound",
    "ScriptStoreSyncFailed",
    "clear_adapted_episode_content",
    "create_script_writing_workflow",
    "generate_and_save_beat_video_prompt",
    "generate_episode_rewrite",
    "load_adapted_episode_content",
    "load_episode_script",
    "load_raw_episode_content",
    "resolve_beat_video_prompt_target",
    "save_adapted_episode_content",
    "save_episode_script",
    "save_raw_episode_content",
    "split_literal_source_text",
    "update_episode_script_beat",
]
