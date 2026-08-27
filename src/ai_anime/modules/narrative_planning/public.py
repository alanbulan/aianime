"""Stable application API exposed by Narrative Planning."""

from collections.abc import Sequence
from importlib import import_module
from pathlib import Path
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from ai_anime.modules.narrative_planning.infrastructure.asset_compiler_agent import (
        AssetCompiler,
    )
    from ai_anime.modules.narrative_planning.infrastructure.episode_planner_agent import (
        EpisodePlannerAgent,
    )
    from ai_anime.modules.narrative_planning.infrastructure.identity_planner_agent import (
        IdentityPlanner,
    )

from ai_anime.modules.narrative_planning.application.adaptive_script_writing import (
    AdaptiveScriptWritingWorkflow,
)
from ai_anime.modules.narrative_planning.application.beat_video_prompts import (
    GeneratedBeatVideoPrompt,
)
from ai_anime.modules.narrative_planning.application.beat_models import (
    NovelVisualBeat,
    SceneRef,
    beat_scene_id,
    beat_scene_ref,
    build_scene_ref,
    sync_beat_asset_refs,
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
from ai_anime.modules.narrative_planning.application.episode_planning_models import (
    NovelEpisode,
    NovelEvent,
    PropMenuItem,
    SceneMenuItem,
    build_prop_menu,
    build_scene_menu,
)
from ai_anime.modules.narrative_planning.application.literal_script_writing import (
    LiteralBeatMetaOutput,
    LiteralScriptWritingWorkflow,
    SceneBlock,
    split_literal_source_text,
)
from ai_anime.modules.narrative_planning.application.manual_beats import (
    InsertManualBeatCommand,
)
from ai_anime.modules.narrative_planning.application.narrative_tasks import (
    IdentityPlanRequired,
    ProjectContextRequired,
    ScenePlanRequired,
)
from ai_anime.modules.narrative_planning.application.ports import (
    EpisodeBeatStore,
    EpisodeRepository,
    ManualBeatStore,
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
from ai_anime.modules.narrative_planning.application.script_models import (
    NarrationScript,
    VisualBeat,
    format_beat_narration,
)
from ai_anime.modules.narrative_planning.application.script_workflow import (
    ScriptWorkflowBlocked,
    ScriptWorkflowExecutor,
    ScriptWorkflowMode,
    ScriptWorkflowNode,
    ScriptWorkflowOptions,
    ScriptWorkflowPlan,
    ScriptWorkflowRuntime,
    ScriptWorkflowSnapshot,
    ScriptWorkflowStage,
    ScriptWorkflowTicket,
    build_script_workflow_plan,
)
from ai_anime.modules.narrative_planning.application.seedance_prompts import (
    GenerateSeedancePromptCommand,
    GeneratedSeedancePrompt,
    SeedancePromptRejected,
)
from ai_anime.modules.narrative_planning.application.task_dto import (
    BeatVideoPromptTask,
    EpisodeAssetPlanningTask,
    ScheduledNarrativeTask,
)
from ai_anime.modules.narrative_planning.composition import (
    beat_video_prompts,
    create_script_writing_workflow,
    episode_catalog,
    episode_beat_media_projection,
    episode_content_service,
    generate_seedance_prompt,
    manual_beat_service,
    manual_sketch_catalog,
    manual_sketch_mode_key,
    schedule_beat_video_prompt,
    schedule_episode_asset_planning,
    schedule_episode_identity_planning,
    schedule_episode_planning,
    script_document_service,
    start_script_generation,
)
from ai_anime.modules.narrative_planning.domain import (
    BeatNotFound,
    BeatVideoPromptSelection,
    FinalBeatTransitionNotAllowed,
    RawEpisodeContentMissing,
    ScriptNotFound,
    beat_order_value,
    group_missing_manual_shot_segments,
    pick_beats_by_number,
    resolve_target_video_duration,
    sort_beats_for_display,
    storyboard_beats_for_manual_sketches,
)
from ai_anime.modules.project_workspace.public import ProjectContext

_LAZY_EXPORTS = {
    "AssetCompiler": (
        "ai_anime.modules.narrative_planning.infrastructure.asset_compiler_agent",
        "AssetCompiler",
    ),
    "EpisodePlannerAgent": (
        "ai_anime.modules.narrative_planning.infrastructure.episode_planner_agent",
        "EpisodePlannerAgent",
    ),
    "IdentityPlanner": (
        "ai_anime.modules.narrative_planning.infrastructure.identity_planner_agent",
        "IdentityPlanner",
    ),
}


def __getattr__(name: str) -> Any:
    target = _LAZY_EXPORTS.get(name)
    if target is None:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
    module_name, attribute_name = target
    value = getattr(import_module(module_name), attribute_name)
    globals()[name] = value
    return value


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


async def get_episode_beats(
    store: EpisodeBeatStore,
    *,
    episode_num: int,
    project_dir: str | Path,
    project_context: ProjectContext,
) -> list[dict[str, Any]]:
    return await episode_beat_media_projection(
        project_dir,
        project_context,
    ).list(store, episode_num)


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


async def insert_manual_shot(
    store: ManualBeatStore,
    *,
    episode_number: int,
    after_beat_number: int | None,
    visual_description: str,
    duration_seconds: float | None = None,
    scene_ref: dict[str, Any] | None = None,
    time_of_day: str | None = None,
    detected_identities: Sequence[str] | None = None,
    detected_props: Sequence[str] | None = None,
    audio_type: str | None = "silence",
    speaker: str | None = None,
    narration_segment: str | None = None,
) -> dict[str, Any]:
    return await manual_beat_service(store).insert(
        store,
        InsertManualBeatCommand(
            episode_number=episode_number,
            after_beat_number=after_beat_number,
            visual_description=visual_description,
            duration_seconds=duration_seconds,
            scene_ref=scene_ref,
            time_of_day=time_of_day,
            detected_identities=detected_identities,
            detected_props=detected_props,
            audio_type=audio_type,
            speaker=speaker,
            narration_segment=narration_segment,
        ),
    )


async def delete_manual_shot(
    store: ManualBeatStore,
    *,
    episode_number: int,
    beat_number: int,
) -> list[dict[str, Any]]:
    return await manual_beat_service(store).delete(
        store,
        episode_number=episode_number,
        beat_number=beat_number,
    )


def missing_manual_shot_segments(
    beats: list[dict[str, Any]],
    sketches_dir: str | Path,
) -> list[list[int]]:
    return group_missing_manual_shot_segments(
        beats,
        sketch_exists=manual_sketch_catalog(str(sketches_dir)).exists,
    )


def choose_manual_sketch_mode_key(count: int) -> str:
    return manual_sketch_mode_key(count)


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
    script_mode: str = "duration",
    target_duration_total: int = 120,
    target_beats: int | None = None,
) -> ScheduledNarrativeTask:
    return await start_script_generation().execute(
        store,
        task_context=task_context,
        output_dir=output_dir,
        episode_num=episode_num,
        script_mode=script_mode,
        target_duration_total=target_duration_total,
        target_beats=target_beats,
    )


async def start_episode_planning(
    task_context: ProjectContext | None,
    *,
    target_episodes: int,
    planning_mode: str,
    output_dir: str | Path,
    state_dir: str | Path,
) -> ScheduledNarrativeTask:
    return await schedule_episode_planning().execute(
        task_context=task_context,
        target_episodes=target_episodes,
        planning_mode=planning_mode,
        output_dir=output_dir,
        state_dir=state_dir,
    )


async def start_episode_asset_planning(
    task_context: ProjectContext | None,
    *,
    episode_num: int,
    asset_kind: str,
) -> ScheduledNarrativeTask:
    return await schedule_episode_asset_planning().execute(
        task_context=task_context,
        episode_num=episode_num,
        asset_kind=asset_kind,
    )


async def start_episode_identity_planning(
    task_context: ProjectContext | None,
    *,
    episode_num: int,
) -> ScheduledNarrativeTask:
    return await schedule_episode_identity_planning().execute(
        task_context=task_context,
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
    "AdaptiveScriptWritingWorkflow",
    "AssetCompiler",
    "BeatNotFound",
    "BeatStoreUpdateFailed",
    "BeatVideoPromptSelection",
    "ClearedEpisodeContent",
    "EpisodeContentDocument",
    "EpisodeContentWriteFailed",
    "EpisodeNotFound",
    "EpisodePlannerAgent",
    "EpisodeAssetPlanningTask",
    "FinalBeatTransitionNotAllowed",
    "GenerateEpisodeRewriteCommand",
    "GenerateSeedancePromptCommand",
    "GeneratedEpisodeRewrite",
    "GeneratedSeedancePrompt",
    "GeneratedBeatVideoPrompt",
    "IdentityPlanRequired",
    "IdentityPlanner",
    "LiteralBeatMetaOutput",
    "LiteralScriptWritingWorkflow",
    "NarrationScript",
    "NovelEpisode",
    "NovelEvent",
    "NovelVisualBeat",
    "PropMenuItem",
    "SceneBlock",
    "SceneMenuItem",
    "SceneRef",
    "SavedEpisodeContent",
    "SavedEpisodeScript",
    "RawEpisodeContentMissing",
    "ProjectContextRequired",
    "ScenePlanRequired",
    "ScheduledNarrativeTask",
    "SeedancePromptRejected",
    "ScriptNotFound",
    "ScriptStoreSyncFailed",
    "ScriptWorkflowBlocked",
    "ScriptWorkflowExecutor",
    "ScriptWorkflowMode",
    "ScriptWorkflowNode",
    "ScriptWorkflowOptions",
    "ScriptWorkflowPlan",
    "ScriptWorkflowRuntime",
    "ScriptWorkflowSnapshot",
    "ScriptWorkflowStage",
    "ScriptWorkflowTicket",
    "VisualBeat",
    "beat_order_value",
    "beat_scene_id",
    "beat_scene_ref",
    "build_prop_menu",
    "build_scene_menu",
    "build_scene_ref",
    "build_script_workflow_plan",
    "choose_manual_sketch_mode_key",
    "clear_adapted_episode_content",
    "create_script_writing_workflow",
    "enqueue_beat_video_prompt_generation",
    "episode_details_data",
    "format_beat_narration",
    "delete_manual_shot",
    "generate_and_save_beat_video_prompt",
    "generate_episode_rewrite",
    "generate_seedance2_beat_prompt",
    "get_episode_details",
    "get_episode_beats",
    "insert_manual_shot",
    "load_adapted_episode_content",
    "load_episode_script",
    "load_raw_episode_content",
    "list_episode_summaries",
    "missing_manual_shot_segments",
    "pick_beats_by_number",
    "resolve_beat_video_prompt_target",
    "save_adapted_episode_content",
    "save_episode_script",
    "save_raw_episode_content",
    "resolve_target_video_duration",
    "serialize_episode_items",
    "start_episode_script_generation",
    "start_episode_planning",
    "start_episode_asset_planning",
    "start_episode_identity_planning",
    "split_literal_source_text",
    "sort_beats_for_display",
    "storyboard_beats_for_manual_sketches",
    "sync_beat_asset_refs",
    "update_episode_script_beat",
    "update_episode_metadata",
]
