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
from ai_anime.modules.narrative_planning.application.episodes import (
    EpisodeNotFound,
    episode_details_data,
    serialize_episode_items,
)
from ai_anime.modules.narrative_planning.application.literal_script_writing import (
    LiteralBeatMetaOutput,
    LiteralScriptWritingWorkflow,
    SceneBlock,
    split_literal_source_text,
)
from ai_anime.modules.narrative_planning.application.narrative_tasks import (
    IdentityPlanRequired,
    ProjectContextRequired,
)
from ai_anime.modules.narrative_planning.application.ports import (
    EpisodeRepository,
    NarrativeContentStore,
    NarrativeScriptStore,
    SeedancePromptStore,
    ScriptDocumentStore,
    ScriptGenerationStore,
)
from ai_anime.modules.narrative_planning.application.script_documents import (
    BeatStoreUpdateFailed,
    SavedEpisodeScript,
    ScriptStoreSyncFailed,
)
from ai_anime.modules.narrative_planning.application.seedance_prompts import (
    GenerateSeedancePromptCommand,
    GeneratedSeedancePrompt,
    SeedancePromptRejected,
)
from ai_anime.modules.narrative_planning.application.task_dto import (
    BeatVideoPromptTask,
    ScheduledNarrativeTask,
)
from ai_anime.modules.narrative_planning.composition import (
    beat_video_prompts,
    create_script_writing_workflow,
    episode_catalog,
    episode_content_service,
    generate_seedance_prompt,
    schedule_beat_video_prompt,
    script_document_service,
    start_script_generation,
)
from ai_anime.modules.narrative_planning.domain import (
    BeatNotFound,
    BeatVideoPromptSelection,
    FinalBeatTransitionNotAllowed,
    RawEpisodeContentMissing,
    ScriptNotFound,
)
from ai_anime.modules.project_workspace.public import ProjectContext


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


def list_episode_summaries(store: EpisodeRepository) -> list[dict[str, Any]]:
    return episode_catalog().list(store)


def get_episode_details(
    store: EpisodeRepository,
    episode_num: int,
) -> dict[str, Any]:
    return episode_catalog().get(store, episode_num)


async def update_episode_metadata(
    store: EpisodeRepository,
    *,
    episode_num: int,
    updates: dict[str, Any],
) -> dict[str, Any]:
    return await episode_catalog().update(
        store,
        episode_num=episode_num,
        updates=updates,
    )


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


async def start_episode_script_generation(
    store: ScriptGenerationStore,
    *,
    task_context: ProjectContext | None,
    output_dir: str | Path,
    episode_num: int,
) -> ScheduledNarrativeTask:
    return await start_script_generation().execute(
        store,
        task_context=task_context,
        output_dir=output_dir,
        episode_num=episode_num,
    )


async def enqueue_beat_video_prompt_generation(
    task_context: ProjectContext,
    *,
    episode_num: int,
    beat_num: int,
    field: str,
    language: str,
    output_dir: str | Path,
) -> ScheduledNarrativeTask:
    return await schedule_beat_video_prompt().execute(
        task_context,
        BeatVideoPromptTask(
            episode=episode_num,
            beat_num=beat_num,
            field=field,
            language=language,
            output_dir=output_dir,
        ),
    )


async def generate_seedance2_beat_prompt(
    store: SeedancePromptStore,
    command: GenerateSeedancePromptCommand,
) -> GeneratedSeedancePrompt:
    return await generate_seedance_prompt().execute(store, command)


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
    "EpisodeNotFound",
    "FinalBeatTransitionNotAllowed",
    "GenerateEpisodeRewriteCommand",
    "GenerateSeedancePromptCommand",
    "GeneratedEpisodeRewrite",
    "GeneratedSeedancePrompt",
    "GeneratedBeatVideoPrompt",
    "IdentityPlanRequired",
    "LiteralBeatMetaOutput",
    "LiteralScriptWritingWorkflow",
    "SceneBlock",
    "SavedEpisodeContent",
    "SavedEpisodeScript",
    "RawEpisodeContentMissing",
    "ProjectContextRequired",
    "ScheduledNarrativeTask",
    "SeedancePromptRejected",
    "ScriptNotFound",
    "ScriptStoreSyncFailed",
    "clear_adapted_episode_content",
    "create_script_writing_workflow",
    "enqueue_beat_video_prompt_generation",
    "episode_details_data",
    "generate_and_save_beat_video_prompt",
    "generate_episode_rewrite",
    "generate_seedance2_beat_prompt",
    "get_episode_details",
    "load_adapted_episode_content",
    "load_episode_script",
    "load_raw_episode_content",
    "list_episode_summaries",
    "resolve_beat_video_prompt_target",
    "save_adapted_episode_content",
    "save_episode_script",
    "save_raw_episode_content",
    "serialize_episode_items",
    "start_episode_script_generation",
    "split_literal_source_text",
    "update_episode_script_beat",
    "update_episode_metadata",
]
