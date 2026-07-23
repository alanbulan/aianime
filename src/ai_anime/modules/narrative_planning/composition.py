from __future__ import annotations

from typing import Any

from ai_anime.modules.narrative_planning.application.beat_video_prompts import (
    BeatVideoPrompts,
)
from ai_anime.modules.narrative_planning.application.episode_content import (
    EpisodeContentService,
)
from ai_anime.modules.narrative_planning.application.episodes import (
    EpisodeCatalog,
)
from ai_anime.modules.narrative_planning.application.literal_script_writing import (
    LiteralScriptWritingWorkflow,
)
from ai_anime.modules.narrative_planning.application.manual_beats import (
    ManualBeatService,
)
from ai_anime.modules.narrative_planning.application.narrative_tasks import (
    ScheduleBeatVideoPrompt,
    ScheduleEpisodePlanning,
    StartScriptGeneration,
)
from ai_anime.modules.narrative_planning.application.script_documents import (
    ScriptDocumentService,
)
from ai_anime.modules.narrative_planning.application.seedance_prompts import (
    GenerateSeedancePrompt,
)
from ai_anime.modules.narrative_planning.infrastructure import (
    beat_prompt_generators,
    content_rewriters,
)
from ai_anime.modules.narrative_planning.infrastructure.sketch_workspace import (
    LocalSketchWorkspace,
)
from ai_anime.modules.narrative_planning.infrastructure.seedance_prompt_gateway import (
    SeedancePanelPromptGateway,
)
from ai_anime.modules.narrative_planning.infrastructure.manual_beat_assets import (
    LocalManualBeatAssetWorkspace,
    LocalManualSketchCatalog,
    choose_manual_sketch_mode_key,
)
from ai_anime.modules.narrative_planning.infrastructure.task_scheduler import (
    TaskBackendScheduler,
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


def episode_content_service() -> EpisodeContentService:
    return EpisodeContentService(
        rewrite_generator=content_rewriters.rewrite_episode_content,
    )


def episode_catalog() -> EpisodeCatalog:
    return EpisodeCatalog()


def script_document_service() -> ScriptDocumentService:
    return ScriptDocumentService()


def manual_beat_service(store: Any) -> ManualBeatService:
    return ManualBeatService(
        LocalManualBeatAssetWorkspace(getattr(store, "project_dir", None))
    )


def manual_sketch_catalog(sketches_dir: str) -> LocalManualSketchCatalog:
    return LocalManualSketchCatalog(sketches_dir)


def manual_sketch_mode_key(count: int) -> str:
    return choose_manual_sketch_mode_key(count)


def narrative_task_scheduler() -> TaskBackendScheduler:
    from ai_anime import ports

    return TaskBackendScheduler(ports.get_task_backend)


def start_script_generation() -> StartScriptGeneration:
    return StartScriptGeneration(
        task_scheduler=narrative_task_scheduler(),
        sketch_workspace=LocalSketchWorkspace(),
    )


def schedule_beat_video_prompt() -> ScheduleBeatVideoPrompt:
    return ScheduleBeatVideoPrompt(narrative_task_scheduler())


def schedule_episode_planning() -> ScheduleEpisodePlanning:
    return ScheduleEpisodePlanning(narrative_task_scheduler())


def generate_seedance_prompt() -> GenerateSeedancePrompt:
    from ai_anime import ports

    return GenerateSeedancePrompt(
        gateway=SeedancePanelPromptGateway(),
        usage_meter=ports.get_usage_meter(),
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
