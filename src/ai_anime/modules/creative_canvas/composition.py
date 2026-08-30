"""Creative Canvas application composition."""

from collections.abc import Mapping, Sequence
from functools import lru_cache
from pathlib import Path
from typing import Literal

from ai_anime.modules.creative_canvas.domain.text_generation import (
    CreativeCanvasTextNodeType,
)
from ai_anime.modules.creative_canvas.application.audio_generation import (
    CreativeCanvasAudioGenerationUseCases,
)
from ai_anime.modules.creative_canvas.application.audio_library import (
    CreativeCanvasAudioLibraryUseCases,
)
from ai_anime.modules.creative_canvas.application.canvas_assets import (
    CreativeCanvasAssetUseCases,
)
from ai_anime.modules.creative_canvas.application.bootstrap import (
    CreativeCanvasBootstrapUseCases,
)
from ai_anime.modules.creative_canvas.application.canvas_documents import (
    CreativeCanvasDocumentQueries,
)
from ai_anime.modules.creative_canvas.application.canvas_events import (
    CreativeCanvasEventRecorder,
)
from ai_anime.modules.creative_canvas.application.canvas_commits import (
    CreativeCanvasSlotCommitUseCases,
)
from ai_anime.modules.creative_canvas.application.canvas_projections import (
    CreativeCanvasProjectionUseCases,
)
from ai_anime.modules.creative_canvas.application.canvas_presets import (
    CreativeCanvasPresetUseCases,
)
from ai_anime.modules.creative_canvas.application.canvas_writes import (
    CreativeCanvasDocumentCommands,
)
from ai_anime.modules.creative_canvas.application.generation_catalog import (
    GenerationCatalogQueries,
)
from ai_anime.modules.creative_canvas.application.job_results import (
    CreativeCanvasJobResultQueries,
)
from ai_anime.modules.creative_canvas.application.job_execution import (
    CreativeCanvasJobExecutionUseCases,
)
from ai_anime.modules.creative_canvas.application.job_workspace import (
    CreativeCanvasJobWorkspace,
)
from ai_anime.modules.creative_canvas.application.generation_history import (
    CreativeCanvasGenerationHistoryUseCases,
)
from ai_anime.modules.creative_canvas.application.mainline_generation import (
    CreativeCanvasMainlineGenerationUseCases,
)
from ai_anime.modules.creative_canvas.application.long_operations import (
    CreativeCanvasLongOperationUseCases,
)
from ai_anime.modules.creative_canvas.application.skill_catalog import (
    CreativeCanvasSkillCatalogQueries,
)
from ai_anime.modules.creative_canvas.application.skill_runs import (
    CreativeCanvasSkillRunUseCases,
)
from ai_anime.modules.creative_canvas.application.staging_prop import (
    CreativeCanvasStagingPropUseCases,
)
from ai_anime.modules.creative_canvas.application.image_to_3gs import (
    CreativeCanvasImageToThreeGsUseCases,
)
from ai_anime.modules.creative_canvas.application.image_editing import (
    CreativeCanvasImageEditingUseCases,
)
from ai_anime.modules.creative_canvas.application.image_generation import (
    CreativeCanvasImageGenerationUseCases,
)
from ai_anime.modules.creative_canvas.application.media import (
    CreativeCanvasMediaUseCases,
)
from ai_anime.modules.creative_canvas.application.mark_detection import (
    CreativeCanvasMarkDetectionUseCases,
)
from ai_anime.modules.creative_canvas.application.reverse_prompt import (
    CreativeCanvasReversePromptExecutionUseCases,
    CreativeCanvasReversePromptUseCases,
)
from ai_anime.modules.creative_canvas.application.text_processing import (
    CreativeCanvasTextProcessingUseCases,
)
from ai_anime.modules.creative_canvas.application.video_processing import (
    CreativeCanvasVideoProcessingUseCases,
)
from ai_anime.modules.creative_canvas.application.video_generation import (
    CreativeCanvasVideoGenerationUseCases,
)
from ai_anime.modules.creative_canvas.application.video_asset_library import (
    CreativeCanvasVideoAssetLibraryUseCases,
)
from ai_anime.modules.creative_canvas.application.vision_analysis import (
    CreativeCanvasVisionAnalysisUseCases,
)
from ai_anime.modules.creative_canvas.infrastructure.bootstrap import (
    LocalCreativeCanvasBootstrapStorage,
)
from ai_anime.modules.creative_canvas.infrastructure.canvas_documents import (
    LocalCreativeCanvasDocumentQueryGateway,
)
from ai_anime.modules.creative_canvas.infrastructure.canvas_events import (
    LocalCreativeCanvasEventWriter,
)
from ai_anime.modules.creative_canvas.infrastructure.canvas_commits import (
    LocalCreativeCanvasSlotCommitGateway,
)
from ai_anime.modules.creative_canvas.infrastructure.canvas_assets import (
    LocalCreativeCanvasAssetCatalogGateway,
    LocalCreativeCanvasBeatSceneSource,
    LocalCreativeCanvasDirectorCaptureStorage,
    LocalCreativeCanvasDirectorStageLinkBuilder,
)
from ai_anime.modules.creative_canvas.infrastructure.canvas_projections import (
    LocalCreativeCanvasProjectionGateway,
)
from ai_anime.modules.creative_canvas.infrastructure.canvas_presets import (
    LocalCreativeCanvasPresetBuilder,
    LocalCreativeCanvasPresetGateway,
)
from ai_anime.modules.creative_canvas.infrastructure.canvas_writes import (
    LocalCreativeCanvasDocumentCommandGateway,
)
from ai_anime.modules.creative_canvas.infrastructure.audio_library import (
    LocalCreativeCanvasAudioLibraryGateway,
)
from ai_anime.modules.creative_canvas.infrastructure.preset_voice_generator import (
    ModelCreativeCanvasPresetVoiceGenerator,
)
from ai_anime.modules.creative_canvas.infrastructure.generation_catalog import (
    ConfiguredGenerationCatalogSource,
)
from ai_anime.modules.creative_canvas.infrastructure.job_results import (
    LocalCreativeCanvasJobResultReader,
)
from ai_anime.modules.creative_canvas.infrastructure.job_workspace import (
    LocalCreativeCanvasJobWorkspace,
)
from ai_anime.modules.creative_canvas.infrastructure.image_job_runtime import (
    CommercialCreativeCanvasImageJobRuntime,
)
from ai_anime.modules.creative_canvas.infrastructure.generation_history import (
    LocalCreativeCanvasGenerationHistoryWriter,
)
from ai_anime.modules.creative_canvas.infrastructure.mainline_generation import (
    LocalCreativeCanvasMainlineGenerationConfigSource,
    LocalCreativeCanvasScene360Runtime,
    PillowCreativeCanvasImageAspectReader,
)
from ai_anime.modules.creative_canvas.infrastructure.skill_runs import (
    LocalCreativeCanvasSkillRunRepository,
    LocalCreativeCanvasSkillWorkspace,
    OptionalCreativeCanvasFrameReviewer,
    TaskManagerCreativeCanvasSkillTaskReader,
)
from ai_anime.modules.creative_canvas.infrastructure.media_sources import (
    ProjectCreativeCanvasMediaSourceResolver,
)
from ai_anime.modules.creative_canvas.infrastructure.image_editing import (
    FreezoneCreativeCanvasImagePromptComposer,
    FreezoneCreativeCanvasImageModelRouter,
    PillowCreativeCanvasImageEditingStorage,
)
from ai_anime.modules.creative_canvas.infrastructure.image_generation import (
    FreezoneCreativeCanvasImageGenerationModelRouter,
)
from ai_anime.modules.creative_canvas.infrastructure.media import (
    FreezoneJobIdGenerator,
    LocalCreativeCanvasMediaStorage,
)
from ai_anime.modules.creative_canvas.infrastructure.staging_prop import (
    DirectorWorldCreativeCanvasStagingPropGenerator,
)
from ai_anime.modules.creative_canvas.infrastructure.mark_detection import (
    PydanticAICreativeCanvasMarkDetector,
)
from ai_anime.modules.creative_canvas.infrastructure.reverse_prompt import (
    VisionCreativeCanvasReversePromptGenerator,
)
from ai_anime.modules.creative_canvas.infrastructure.task_submission import (
    TaskExecutionCreativeCanvasTaskScheduler,
)
from ai_anime.modules.creative_canvas.infrastructure.text_sources import (
    LocalCreativeCanvasTextSourceReader,
)
from ai_anime.modules.creative_canvas.infrastructure.text_generation import (
    bind_story_script_assets as bind_story_script_assets_impl,
    generate_creative_canvas_story_script as generate_story_script,
    generate_creative_canvas_story_script_with_vision as generate_story_script_with_vision_impl,
    translate_creative_canvas_text as translate_text,
)
from ai_anime.modules.creative_canvas.infrastructure.video_generation import (
    ConfiguredCreativeCanvasVideoModelPolicy,
    FfprobeCreativeCanvasReferenceDurationProbe,
)
from ai_anime.modules.creative_canvas.infrastructure.video_asset_library import (
    LocalCreativeCanvasVideoAssetRepository,
    ProjectCreativeCanvasMainlineVideoAssetSource,
    SystemCreativeCanvasClock,
    UuidCreativeCanvasVideoAssetIdGenerator,
)
from ai_anime.modules.creative_canvas.infrastructure.vision_model import (
    PydanticAICreativeCanvasVisionAnalyzer,
)
from ai_anime.modules.creative_canvas.infrastructure.video_analysis_job_runtime import (
    FfmpegCreativeCanvasVideoAnalysisJobRuntime,
)
from ai_anime.modules.creative_canvas.infrastructure.video_composition_job_runtime import (
    FfmpegCreativeCanvasVideoCompositionJobRuntime,
)
from ai_anime.modules.creative_canvas.infrastructure.video_erase_job_runtime import (
    FfmpegCreativeCanvasVideoEraseJobRuntime,
)
from ai_anime.modules.creative_canvas.infrastructure.video_generation_job_runtime import (
    CommercialCreativeCanvasVideoGenerationJobRuntime,
)
from ai_anime.modules.creative_canvas.infrastructure.video_processing_job_runtime import (
    FfmpegCreativeCanvasVideoProcessingJobRuntime,
)
from ai_anime.modules.task_execution.public import project_task_submission_use_cases


async def translate_creative_canvas_text(
    *,
    text: str,
    model: str,
    model_selector: str | None = None,
    node_type: CreativeCanvasTextNodeType = "generic",
) -> tuple[str, Literal["zh", "en"], Literal["zh", "en"]]:
    return await translate_text(
        text=text,
        model=model,
        model_selector=model_selector,
        node_type=node_type,
    )


async def generate_creative_canvas_story_script(
    *,
    source_text: str,
    prompt: str = "",
    model: str,
    model_selector: str | None = None,
    character_refs: Sequence[Mapping[str, object]] | None = None,
) -> dict[str, object]:
    return await generate_story_script(
        source_text=source_text,
        prompt=prompt,
        model=model,
        model_selector=model_selector,
        character_refs=character_refs,
    )


async def generate_story_script_with_vision(
    *,
    frame_paths: Sequence[str | Path] = (),
    character_image_paths: Sequence[str | Path] = (),
    source_text: str = "",
    prompt: str = "",
    duration_sec: float | None = None,
    character_refs: Sequence[Mapping[str, object]] | None = None,
    model: str,
    model_selector: str | None = None,
) -> dict[str, object]:
    return await generate_story_script_with_vision_impl(
        frame_paths=frame_paths,
        character_image_paths=character_image_paths,
        source_text=source_text,
        prompt=prompt,
        duration_sec=duration_sec,
        character_refs=character_refs,
        model=model,
        model_selector=model_selector,
    )


def bind_story_script_assets(
    payload: dict[str, object],
    *,
    frame_urls: Sequence[str] = (),
    character_refs: Sequence[Mapping[str, object]] | None = None,
) -> dict[str, object]:
    return bind_story_script_assets_impl(
        payload,
        frame_urls=frame_urls,
        character_refs=character_refs,
    )


@lru_cache(maxsize=1)
def creative_canvas_bootstrap_use_cases() -> CreativeCanvasBootstrapUseCases:
    return CreativeCanvasBootstrapUseCases(LocalCreativeCanvasBootstrapStorage())


@lru_cache(maxsize=1)
def creative_canvas_document_queries() -> CreativeCanvasDocumentQueries:
    return CreativeCanvasDocumentQueries(
        LocalCreativeCanvasDocumentQueryGateway(),
    )


@lru_cache(maxsize=1)
def creative_canvas_event_recorder() -> CreativeCanvasEventRecorder:
    return CreativeCanvasEventRecorder(LocalCreativeCanvasEventWriter())


@lru_cache(maxsize=1)
def creative_canvas_document_commands() -> CreativeCanvasDocumentCommands:
    return CreativeCanvasDocumentCommands(
        LocalCreativeCanvasDocumentCommandGateway(),
        creative_canvas_event_recorder(),
    )


@lru_cache(maxsize=1)
def creative_canvas_asset_use_cases() -> CreativeCanvasAssetUseCases:
    return CreativeCanvasAssetUseCases(
        LocalCreativeCanvasBeatSceneSource(),
        LocalCreativeCanvasDirectorCaptureStorage(),
        LocalCreativeCanvasDirectorStageLinkBuilder(),
        LocalCreativeCanvasAssetCatalogGateway(),
    )


@lru_cache(maxsize=1)
def creative_canvas_slot_commit_use_cases() -> CreativeCanvasSlotCommitUseCases:
    return CreativeCanvasSlotCommitUseCases(
        LocalCreativeCanvasSlotCommitGateway(),
        creative_canvas_event_recorder(),
    )


@lru_cache(maxsize=1)
def creative_canvas_preset_builder() -> LocalCreativeCanvasPresetBuilder:
    return LocalCreativeCanvasPresetBuilder()


@lru_cache(maxsize=1)
def creative_canvas_preset_gateway() -> LocalCreativeCanvasPresetGateway:
    return LocalCreativeCanvasPresetGateway()


@lru_cache(maxsize=1)
def creative_canvas_preset_use_cases() -> CreativeCanvasPresetUseCases:
    return CreativeCanvasPresetUseCases(
        creative_canvas_preset_builder(),
        creative_canvas_preset_gateway(),
        creative_canvas_event_recorder(),
    )


@lru_cache(maxsize=1)
def creative_canvas_projection_use_cases() -> CreativeCanvasProjectionUseCases:
    return CreativeCanvasProjectionUseCases(
        LocalCreativeCanvasProjectionGateway(creative_canvas_preset_builder()),
        creative_canvas_event_recorder(),
    )


@lru_cache(maxsize=1)
def generation_catalog_queries() -> GenerationCatalogQueries:
    return GenerationCatalogQueries(ConfiguredGenerationCatalogSource())


@lru_cache(maxsize=1)
def creative_canvas_job_result_queries() -> CreativeCanvasJobResultQueries:
    return CreativeCanvasJobResultQueries(LocalCreativeCanvasJobResultReader())


@lru_cache(maxsize=1)
def creative_canvas_job_workspace() -> CreativeCanvasJobWorkspace:
    return LocalCreativeCanvasJobWorkspace()


@lru_cache(maxsize=1)
def creative_canvas_generation_history_use_cases() -> (
    CreativeCanvasGenerationHistoryUseCases
):
    return CreativeCanvasGenerationHistoryUseCases(
        LocalCreativeCanvasGenerationHistoryWriter()
    )


@lru_cache(maxsize=1)
def creative_canvas_mainline_generation_use_cases() -> (
    CreativeCanvasMainlineGenerationUseCases
):
    return CreativeCanvasMainlineGenerationUseCases(
        ProjectCreativeCanvasMediaSourceResolver(),
        LocalCreativeCanvasMainlineGenerationConfigSource(),
        PillowCreativeCanvasImageAspectReader(),
        LocalCreativeCanvasScene360Runtime(),
        FreezoneJobIdGenerator(),
        TaskExecutionCreativeCanvasTaskScheduler(
            project_task_submission_use_cases(),
            translate_runtime_errors=False,
        ),
    )


@lru_cache(maxsize=1)
def creative_canvas_skill_catalog_queries() -> CreativeCanvasSkillCatalogQueries:
    return CreativeCanvasSkillCatalogQueries()


@lru_cache(maxsize=1)
def creative_canvas_skill_run_use_cases() -> CreativeCanvasSkillRunUseCases:
    return CreativeCanvasSkillRunUseCases(
        creative_canvas_skill_catalog_queries(),
        LocalCreativeCanvasSkillRunRepository(),
        LocalCreativeCanvasSkillWorkspace(),
        TaskManagerCreativeCanvasSkillTaskReader(),
        OptionalCreativeCanvasFrameReviewer(),
        FreezoneJobIdGenerator(),
        creative_canvas_mainline_generation_use_cases(),
        creative_canvas_image_generation_use_cases(),
        creative_canvas_slot_commit_use_cases(),
        creative_canvas_event_recorder(),
    )


@lru_cache(maxsize=1)
def creative_canvas_staging_prop_use_cases() -> CreativeCanvasStagingPropUseCases:
    return CreativeCanvasStagingPropUseCases(
        DirectorWorldCreativeCanvasStagingPropGenerator()
    )


@lru_cache(maxsize=1)
def creative_canvas_media_use_cases() -> CreativeCanvasMediaUseCases:
    return CreativeCanvasMediaUseCases(
        LocalCreativeCanvasMediaStorage(),
        FreezoneJobIdGenerator(),
    )


@lru_cache(maxsize=1)
def creative_canvas_mark_detection_use_cases() -> CreativeCanvasMarkDetectionUseCases:
    return CreativeCanvasMarkDetectionUseCases(
        ProjectCreativeCanvasMediaSourceResolver(),
        PydanticAICreativeCanvasMarkDetector(),
    )


@lru_cache(maxsize=1)
def creative_canvas_reverse_prompt_use_cases() -> CreativeCanvasReversePromptUseCases:
    return CreativeCanvasReversePromptUseCases(
        ProjectCreativeCanvasMediaSourceResolver(),
        FreezoneJobIdGenerator(),
        TaskExecutionCreativeCanvasTaskScheduler(project_task_submission_use_cases()),
    )


@lru_cache(maxsize=1)
def creative_canvas_reverse_prompt_execution_use_cases() -> (
    CreativeCanvasReversePromptExecutionUseCases
):
    return CreativeCanvasReversePromptExecutionUseCases(
        VisionCreativeCanvasReversePromptGenerator()
    )


@lru_cache(maxsize=1)
def creative_canvas_vision_analysis_use_cases() -> CreativeCanvasVisionAnalysisUseCases:
    return CreativeCanvasVisionAnalysisUseCases(
        PydanticAICreativeCanvasVisionAnalyzer()
    )


@lru_cache(maxsize=1)
def creative_canvas_job_execution_use_cases() -> CreativeCanvasJobExecutionUseCases:
    workspace = creative_canvas_job_workspace()
    return CreativeCanvasJobExecutionUseCases(
        workspace,
        CommercialCreativeCanvasImageJobRuntime(workspace),
        FfmpegCreativeCanvasVideoProcessingJobRuntime(workspace),
        FfmpegCreativeCanvasVideoCompositionJobRuntime(workspace),
        FfmpegCreativeCanvasVideoEraseJobRuntime(workspace),
        CommercialCreativeCanvasVideoGenerationJobRuntime(workspace),
        FfmpegCreativeCanvasVideoAnalysisJobRuntime(
            workspace,
            creative_canvas_vision_analysis_use_cases(),
        ),
    )


@lru_cache(maxsize=1)
def creative_canvas_image_to_three_gs_use_cases() -> (
    CreativeCanvasImageToThreeGsUseCases
):
    return CreativeCanvasImageToThreeGsUseCases(
        ProjectCreativeCanvasMediaSourceResolver(),
        FreezoneJobIdGenerator(),
        TaskExecutionCreativeCanvasTaskScheduler(project_task_submission_use_cases()),
    )


@lru_cache(maxsize=1)
def creative_canvas_image_editing_use_cases() -> CreativeCanvasImageEditingUseCases:
    return CreativeCanvasImageEditingUseCases(
        ProjectCreativeCanvasMediaSourceResolver(),
        PillowCreativeCanvasImageEditingStorage(),
        FreezoneCreativeCanvasImagePromptComposer(),
        FreezoneCreativeCanvasImageModelRouter(),
        FreezoneJobIdGenerator(),
        TaskExecutionCreativeCanvasTaskScheduler(project_task_submission_use_cases()),
    )


@lru_cache(maxsize=1)
def creative_canvas_reference_image_editing_use_cases() -> (
    CreativeCanvasImageEditingUseCases
):
    return CreativeCanvasImageEditingUseCases(
        ProjectCreativeCanvasMediaSourceResolver(),
        PillowCreativeCanvasImageEditingStorage(),
        FreezoneCreativeCanvasImagePromptComposer(),
        FreezoneCreativeCanvasImageModelRouter(),
        FreezoneJobIdGenerator(),
        TaskExecutionCreativeCanvasTaskScheduler(
            project_task_submission_use_cases(),
            translate_runtime_errors=False,
        ),
    )


@lru_cache(maxsize=1)
def creative_canvas_image_generation_use_cases() -> (
    CreativeCanvasImageGenerationUseCases
):
    return CreativeCanvasImageGenerationUseCases(
        ProjectCreativeCanvasMediaSourceResolver(),
        FreezoneCreativeCanvasImagePromptComposer(),
        FreezoneCreativeCanvasImageGenerationModelRouter(),
        FreezoneJobIdGenerator(),
        TaskExecutionCreativeCanvasTaskScheduler(
            project_task_submission_use_cases(),
            translate_runtime_errors=False,
        ),
    )


@lru_cache(maxsize=1)
def creative_canvas_audio_generation_use_cases() -> (
    CreativeCanvasAudioGenerationUseCases
):
    return CreativeCanvasAudioGenerationUseCases(
        FreezoneJobIdGenerator(),
        TaskExecutionCreativeCanvasTaskScheduler(
            project_task_submission_use_cases(),
            translate_runtime_errors=False,
        ),
    )


@lru_cache(maxsize=1)
def creative_canvas_long_operation_use_cases() -> CreativeCanvasLongOperationUseCases:
    return CreativeCanvasLongOperationUseCases(
        FreezoneJobIdGenerator(),
        TaskExecutionCreativeCanvasTaskScheduler(
            project_task_submission_use_cases(),
            translate_runtime_errors=False,
        ),
    )


@lru_cache(maxsize=1)
def creative_canvas_audio_library_use_cases() -> CreativeCanvasAudioLibraryUseCases:
    return CreativeCanvasAudioLibraryUseCases(
        LocalCreativeCanvasAudioLibraryGateway(),
        ModelCreativeCanvasPresetVoiceGenerator(),
    )


@lru_cache(maxsize=1)
def creative_canvas_text_processing_use_cases() -> CreativeCanvasTextProcessingUseCases:
    return CreativeCanvasTextProcessingUseCases(
        ProjectCreativeCanvasMediaSourceResolver(),
        LocalCreativeCanvasTextSourceReader(),
        FreezoneJobIdGenerator(),
        TaskExecutionCreativeCanvasTaskScheduler(
            project_task_submission_use_cases(),
            translate_runtime_errors=False,
        ),
    )


@lru_cache(maxsize=1)
def creative_canvas_video_processing_use_cases() -> (
    CreativeCanvasVideoProcessingUseCases
):
    return CreativeCanvasVideoProcessingUseCases(
        ProjectCreativeCanvasMediaSourceResolver(),
        FreezoneJobIdGenerator(),
        TaskExecutionCreativeCanvasTaskScheduler(
            project_task_submission_use_cases(),
            translate_runtime_errors=False,
        ),
    )


@lru_cache(maxsize=1)
def creative_canvas_video_model_policy() -> ConfiguredCreativeCanvasVideoModelPolicy:
    return ConfiguredCreativeCanvasVideoModelPolicy()


@lru_cache(maxsize=1)
def creative_canvas_video_asset_repository() -> LocalCreativeCanvasVideoAssetRepository:
    return LocalCreativeCanvasVideoAssetRepository()


@lru_cache(maxsize=1)
def creative_canvas_video_asset_library_use_cases() -> (
    CreativeCanvasVideoAssetLibraryUseCases
):
    return CreativeCanvasVideoAssetLibraryUseCases(
        creative_canvas_video_asset_repository(),
        ProjectCreativeCanvasMediaSourceResolver(),
        ProjectCreativeCanvasMainlineVideoAssetSource(),
        UuidCreativeCanvasVideoAssetIdGenerator(),
        SystemCreativeCanvasClock(),
    )


@lru_cache(maxsize=1)
def creative_canvas_video_generation_use_cases() -> (
    CreativeCanvasVideoGenerationUseCases
):
    return CreativeCanvasVideoGenerationUseCases(
        ProjectCreativeCanvasMediaSourceResolver(),
        creative_canvas_video_model_policy(),
        FfprobeCreativeCanvasReferenceDurationProbe(),
        creative_canvas_video_asset_repository(),
        FreezoneJobIdGenerator(),
        TaskExecutionCreativeCanvasTaskScheduler(project_task_submission_use_cases()),
    )
