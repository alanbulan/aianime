"""Stable application API exposed by Creative Canvas."""

from collections.abc import Mapping
from contextlib import AbstractContextManager
from pathlib import Path
from typing import Any, Literal

from ai_anime.modules.creative_canvas.application.audio_generation import (
    CreativeCanvasGeneratedAudio,
    CreativeCanvasAudioGenerationUseCases,
    InvalidCreativeCanvasAudioGenerationRequest,
    StartCreativeCanvasMusicGenerationCommand,
    StartCreativeCanvasSpeechGenerationCommand,
)
from ai_anime.modules.creative_canvas.application.audio_library import (
    CreateCreativeCanvasAudioVoiceCommand,
    CreativeCanvasAudioLibraryUseCases,
    CreativeCanvasAudioVoiceMissing,
    GetCreativeCanvasAudioVoiceQuery,
    InvalidCreativeCanvasAudioLibraryRequest,
    ListCreativeCanvasAudioReferencesQuery,
)
from ai_anime.modules.creative_canvas.application.bootstrap import (
    CreativeCanvasBootstrapBusy,
    CreativeCanvasBootstrapCorrupt,
    CreativeCanvasBootstrapResult,
    CreativeCanvasBootstrapUseCases,
    InitializeCreativeCanvasCommand,
)
from ai_anime.modules.creative_canvas.application.canvas_assets import (
    CreativeCanvasAssetUseCases,
    CreativeCanvasBeatNotFound,
    GetCreativeCanvasDirectorCaptureQuery,
    GetCreativeCanvasSceneAssetsQuery,
    InvalidCreativeCanvasBeatContextQuery,
    ListCreativeCanvasAssetsQuery,
    ListCreativeCanvasBeatContextAssetsQuery,
    SyncCreativeCanvasDirectorBackgroundCommand,
)
from ai_anime.modules.creative_canvas.application.canvas_documents import (
    CreativeCanvasDocumentBusy,
    CreativeCanvasDocumentCorrupt,
    CreativeCanvasDocumentQueries,
    GetCreativeCanvasDocumentQuery,
    InvalidCreativeCanvasDocumentQuery,
    ListCreativeCanvasDocumentHistoryQuery,
    ListCreativeCanvasDocumentsQuery,
    ListCreativeCanvasGenerationHistoryQuery,
    ListCreativeCanvasNodeGenerationHistoryQuery,
)
from ai_anime.modules.creative_canvas.application.canvas_events import (
    CreativeCanvasEventRecorder,
    RecordCreativeCanvasEventCommand,
)
from ai_anime.modules.creative_canvas.application.canvas_commits import (
    CommitCreativeCanvasSlotCommand,
    CopyCreativeCanvasSlotCommand,
    CreativeCanvasSlotBeatNotFound,
    CreativeCanvasSlotCommitUseCases,
    CreativeCanvasSlotCopyResult,
    CreativeCanvasSlotSourceNotFound,
    GetCreativeCanvasSlotImpactQuery,
    InvalidCreativeCanvasSlotCommit,
)
from ai_anime.modules.creative_canvas.application.canvas_projections import (
    BuildCreativeCanvasProjectionQuery,
    CreativeCanvasProjectionCanvasNotFound,
    CreativeCanvasProjectionUseCases,
    GetCreativeCanvasProjectionStatusQuery,
    ProjectCreativeCanvasProjectionCommand,
    RemoveCreativeCanvasProjectionCommand,
)
from ai_anime.modules.creative_canvas.application.canvas_presets import (
    CreateCreativeCanvasPresetCommand,
    CreativeCanvasPresetCanvasNotFound,
    CreativeCanvasPresetMismatch,
    CreativeCanvasPresetSourceNotFound,
    CreativeCanvasPresetUseCases,
    InvalidCreativeCanvasPresetRequest,
)
from ai_anime.modules.creative_canvas.application.canvas_writes import (
    CreativeCanvasDocumentBaseRevisionRequired,
    CreativeCanvasDocumentCommands,
    CreativeCanvasDocumentHistoryNotFound,
    CreativeCanvasDocumentIdempotencyConflict,
    CreativeCanvasDocumentRevisionConflict,
    CreativeCanvasDocumentStorageFailed,
    CreativeCanvasDocumentWriteError,
    DangerousCreativeCanvasDocumentOverwrite,
    DeleteCreativeCanvasDocumentCommand,
    InvalidCreativeCanvasDocumentHistoryId,
    RestoreCreativeCanvasDocumentCommand,
    SaveCreativeCanvasDocumentCommand,
)
from ai_anime.modules.creative_canvas.application.generation_catalog import (
    GenerationCatalogQueries,
)
from ai_anime.modules.creative_canvas.application.generation_history import (
    CreativeCanvasGenerationHistoryUseCases,
    RecordCreativeCanvasGenerationCommand,
)
from ai_anime.modules.creative_canvas.application.job_results import (
    CreativeCanvasJobResultQueries,
    CreativeCanvasJobType,
    GetCreativeCanvasJobResultQuery,
    public_creative_canvas_video_story_result,
)
from ai_anime.modules.creative_canvas.application.job_execution import (
    AnalyzeCreativeCanvasShotsJobCommand,
    ComposeCreativeCanvasVideoJobCommand,
    CreativeCanvasJobExecutionUseCases,
    EditCreativeCanvasImageJobCommand,
    EraseCreativeCanvasVideoJobCommand,
    ExtractCreativeCanvasFramesJobCommand,
    GenerateCreativeCanvasImageJobCommand,
    GenerateCreativeCanvasVideoJobCommand,
    MaskEditCreativeCanvasImageJobCommand,
    SeparateCreativeCanvasAudioJobCommand,
    UpscaleCreativeCanvasVideoJobCommand,
)
from ai_anime.modules.creative_canvas.application.job_workspace import (
    CreativeCanvasJobWorkspace,
)
from ai_anime.modules.creative_canvas.application.mainline_generation import (
    MAINLINE_SCENE_360_IMAGE_SIZE,
    CreativeCanvasMainlineBeatMissing,
    CreativeCanvasMainlineGenerationUseCases,
    CreativeCanvasMainlineMediaMissing,
    GenerateCreativeCanvasFrameFromContextCommand,
    GenerateCreativeCanvasScene360Command,
    GenerateCreativeCanvasSketchFromContextCommand,
    InvalidCreativeCanvasMainlineGeneration,
    StartCreativeCanvasBackgroundSketchCommand,
    StartCreativeCanvasBeatSketchCommand,
    StartCreativeCanvasDirectorSketchCommand,
    StartCreativeCanvasFrameFromContextCommand,
    StartCreativeCanvasScene360Command,
)
from ai_anime.modules.creative_canvas.application.skill_catalog import (
    SKILL_SCHEMA_VERSION,
    CanvasGraphPatch,
    CreativeCanvasSkillCatalogQueries,
    ResolvedSkillInput,
    SkillDefinition,
    SkillErrorEnvelope,
    SkillInputAcceptSpec,
    SkillRunOutput,
    SkillRunRequest,
    SkillRunResponse,
    SkillRunResult,
)
from ai_anime.modules.creative_canvas.application.skill_run_contracts import (
    CreativeCanvasSkillRunRejected,
    GetCreativeCanvasSkillRunResultQuery,
    RunCreativeCanvasSkillCommand,
)
from ai_anime.modules.creative_canvas.application.skill_runs import (
    CreativeCanvasSkillRunUseCases,
)
from ai_anime.modules.creative_canvas.application.staging_prop import (
    CreativeCanvasStagingPropRejected,
    CreativeCanvasStagingPropUseCases,
    GenerateCreativeCanvasStagingPropCommand,
)
from ai_anime.modules.creative_canvas.application.image_to_3gs import (
    CreativeCanvasImageToThreeGsResult,
    CreativeCanvasImageToThreeGsSourceMissing,
    CreativeCanvasImageToThreeGsUseCases,
    InvalidCreativeCanvasImageToThreeGsRequest,
    StartCreativeCanvasImageToThreeGsCommand,
)
from ai_anime.modules.creative_canvas.application.image_editing import (
    CreativeCanvasImageEditingSourceMissing,
    CreativeCanvasImageEditingUseCases,
    InvalidCreativeCanvasImageEditingRequest,
    StartCreativeCanvasImageEditingCommand,
    StartCreativeCanvasReferenceImageEditingCommand,
)
from ai_anime.modules.creative_canvas.application.image_generation import (
    CreativeCanvasImageGenerationReferenceMissing,
    CreativeCanvasImageGenerationUseCases,
    InvalidCreativeCanvasImageGenerationRequest,
    StartCreativeCanvasImageGenerationCommand,
)
from ai_anime.modules.creative_canvas.application.media import (
    CreativeCanvasMediaUseCases,
    CreativeCanvasScreenshotResult,
    CreativeCanvasUploadResult,
    SaveCreativeCanvasScreenshotCommand,
    StoreCreativeCanvasUploadCommand,
)
from ai_anime.modules.creative_canvas.application.mark_detection import (
    CreativeCanvasMarkDetectionFailed,
    CreativeCanvasMarkDetectionResult,
    CreativeCanvasMarkDetectionUseCases,
    DetectCreativeCanvasMarkCommand,
    InvalidCreativeCanvasMarkRequest,
)
from ai_anime.modules.creative_canvas.application.reverse_prompt import (
    CreativeCanvasReversePromptExecutionUseCases,
    CreativeCanvasReversePromptSourceMissing,
    CreativeCanvasReversePromptUseCases,
    InvalidCreativeCanvasReversePromptRequest,
    StartCreativeCanvasReversePromptCommand,
)
from ai_anime.modules.creative_canvas.application.task_submission import (
    CreativeCanvasTaskReceipt,
    CreativeCanvasTaskStartFailed,
)
from ai_anime.modules.creative_canvas.application.text_processing import (
    CreativeCanvasTextProcessingSourceMissing,
    CreativeCanvasTextProcessingUseCases,
    InvalidCreativeCanvasTextProcessingRequest,
    StartCreativeCanvasStoryScriptCommand,
    StartCreativeCanvasTextTranslationCommand,
)
from ai_anime.modules.creative_canvas.application.video_processing import (
    CreativeCanvasVideoCompositionItem,
    CreativeCanvasVideoCompositionTrack,
    CreativeCanvasVideoProcessingSourceMissing,
    CreativeCanvasVideoProcessingUseCases,
    InvalidCreativeCanvasVideoProcessingRequest,
    StartCreativeCanvasAudioSeparationCommand,
    StartCreativeCanvasFrameExtractionCommand,
    StartCreativeCanvasShotAnalysisCommand,
    StartCreativeCanvasVideoEraseCommand,
    StartCreativeCanvasVideoCompositionCommand,
    StartCreativeCanvasVideoUpscaleCommand,
    StartCreativeCanvasVideoStoryAnalysisCommand,
)
from ai_anime.modules.creative_canvas.application.video_generation import (
    CreativeCanvasOmniVideoReference,
    CreativeCanvasVideoCharacterMissing,
    CreativeCanvasVideoGenerationOptions,
    CreativeCanvasVideoGenerationResult,
    CreativeCanvasVideoGenerationUseCases,
    InvalidCreativeCanvasVideoGenerationRequest,
    StartCreativeCanvasImageVideoCommand,
    StartCreativeCanvasKeyframeVideoCommand,
    StartCreativeCanvasOmniVideoCommand,
    StartCreativeCanvasTextVideoCommand,
    StartCreativeCanvasVideoEditCommand,
)
from ai_anime.modules.creative_canvas.application.vision_analysis import (
    AnalyzeCreativeCanvasVisionCommand,
    CreativeCanvasVisionAnalysisUseCases,
    CreativeCanvasVisionInput,
    creative_canvas_image_media_type,
)
from ai_anime.modules.creative_canvas.domain.mainline_generation import (
    beat_context_as_prompt_beat,
    build_scene_360_prompt,
    infer_scene_id_from_master_path,
    is_standalone_beat_context,
    normalize_mainline_aspect_ratio,
    normalize_mainline_frame_quality,
    standalone_character_map,
    standalone_prop_marker_colors,
    standalone_sketch_colors,
)
from ai_anime.modules.creative_canvas.domain.text_generation import (
    CreativeCanvasTextNodeType,
)
from ai_anime.modules.creative_canvas.domain.video_analysis import (
    build_video_story_analysis_prompt,
)
from ai_anime.modules.creative_canvas.domain.video_processing import (
    build_creative_canvas_video_upscale_filter,
)
from ai_anime.modules.creative_canvas.application.video_asset_library import (
    AddCreativeCanvasVideoAssetCommand,
    CreativeCanvasVideoAssetLibraryUseCases,
    CreativeCanvasVideoAssetMissing,
    CreativeCanvasVideoAssetSourceMissing,
    CreativeCanvasVideoAssetSyncResult,
    InvalidCreativeCanvasVideoAssetRequest,
    SyncCreativeCanvasVideoAssetsCommand,
)
from ai_anime.modules.creative_canvas.domain import (
    CREATIVE_CANVAS_AUDIO_AGE_GROUP_LABELS,
    CREATIVE_CANVAS_PRESET_IMAGE_ASPECT_RATIOS,
    PresetRef,
    as_preset_list,
    context_preset_sketch_aspect_ratio,
    extract_preset_visual_markers,
    normalize_preset_scene_name,
    nearest_preset_image_aspect_ratio,
    normalize_preset_image_aspect_ratio,
    parse_preset_aspect_ratio,
    preset_identity_character,
    preset_identity_id,
    preset_identity_name,
    preset_prop_id,
    preset_ref_mainline_context,
    project_preset_sketch_aspect_ratio,
    real_preset_identity_ids,
    real_preset_prop_ids,
    replace_preset_beat_markers,
    CreativeCanvasImageCameraConfig,
    CreativeCanvasImageStyleConfig,
    CreativeCanvasEventActor,
    CreativeCanvasMarkSelection,
    CreativeCanvasScreenshotTooLarge,
    CreativeCanvasVideoEraseMode,
    InvalidCreativeCanvasImageSize,
    InvalidCreativeCanvasImageTemplateMode,
    InvalidCreativeCanvasPngScreenshot,
    canvas_actor_id,
    canvas_event_actor,
    canvas_id_for_preset,
    build_image_multi_view_prompt,
    build_image_relight_prompt,
    build_image_template_edit_prompt,
    build_freezone_image_to_video_prompt,
    build_freezone_keyframe_video_prompt,
    build_freezone_omni_video_prompt,
    build_freezone_video_prompt,
    detected_reference_ids_from_beat_context_data,
    default_push_target_for_preset,
    first_text_value,
    get_video_camera_template,
    get_video_camera_templates,
    is_preset_managed_canvas_node,
    merge_projected_preset_canvas,
    merge_restored_preset_canvas,
    preset_facts_signature,
    preset_facts_signature_from_payload,
    preset_key_for_request,
    prepare_creative_canvas_payload_for_write,
    projection_facts_signature_from_payload,
    projection_group_label,
    normalize_video_aspect_ratio,
    normalize_video_resolution,
    resolve_image_template_aspect_ratio,
    remove_projected_preset_canvas,
    resolve_original_image_aspect_ratio,
    safe_creative_canvas_identifier_fragment,
    summarize_omni_reference_counts,
    stamp_canvas_mainline_context_project_id,
    stamp_preset_facts_signature,
    stamp_projection_key,
    stamp_projection_metadata,
    sync_frame_context_reference_edges,
    validate_omni_reference_limits,
    validate_video_composition_media_item_count,
    validate_video_composition_source_range,
    validate_video_composition_track_count,
    validate_video_composition_video_item_count,
    validate_video_erase_box,
    wrap_projection_payload_in_group,
)
from ai_anime.modules.creative_canvas.domain.canvas_identity import (
    is_valid_creative_canvas_id as is_valid_creative_canvas_id,
)
from ai_anime.modules.creative_canvas.domain.slot_targets import (
    SlotTarget as SlotTarget,
)


def creative_canvas_bootstrap_use_cases() -> CreativeCanvasBootstrapUseCases:
    from ai_anime.modules.creative_canvas.composition import (
        creative_canvas_bootstrap_use_cases as build,
    )

    return build()


def creative_canvas_write_lock(
    project_dir: Path,
    canvas_id: str,
    *,
    timeout_seconds: float = 3.0,
) -> AbstractContextManager[None]:
    from ai_anime.modules.creative_canvas.infrastructure.canvas_lock import (
        canvas_write_lock,
    )

    return canvas_write_lock(
        project_dir,
        canvas_id,
        timeout_seconds=timeout_seconds,
    )


def creative_canvas_document_queries() -> CreativeCanvasDocumentQueries:
    from ai_anime.modules.creative_canvas.composition import (
        creative_canvas_document_queries as build,
    )

    return build()


def creative_canvas_document_commands() -> CreativeCanvasDocumentCommands:
    from ai_anime.modules.creative_canvas.composition import (
        creative_canvas_document_commands as build,
    )

    return build()


def creative_canvas_asset_use_cases() -> CreativeCanvasAssetUseCases:
    from ai_anime.modules.creative_canvas.composition import (
        creative_canvas_asset_use_cases as build,
    )

    return build()


def creative_canvas_event_recorder() -> CreativeCanvasEventRecorder:
    from ai_anime.modules.creative_canvas.composition import (
        creative_canvas_event_recorder as build,
    )

    return build()


def creative_canvas_slot_commit_use_cases() -> CreativeCanvasSlotCommitUseCases:
    from ai_anime.modules.creative_canvas.composition import (
        creative_canvas_slot_commit_use_cases as build,
    )

    return build()


def creative_canvas_preset_use_cases() -> CreativeCanvasPresetUseCases:
    from ai_anime.modules.creative_canvas.composition import (
        creative_canvas_preset_use_cases as build,
    )

    return build()


def creative_canvas_projection_use_cases() -> CreativeCanvasProjectionUseCases:
    from ai_anime.modules.creative_canvas.composition import (
        creative_canvas_projection_use_cases as build,
    )

    return build()


def record_creative_canvas_event(
    *,
    project_dir: Path,
    project_id: str,
    canvas_id: str | None,
    event_type: str,
    actor: CreativeCanvasEventActor,
    payload: Mapping[str, Any],
) -> None:
    creative_canvas_event_recorder().record(
        RecordCreativeCanvasEventCommand(
            project_dir=project_dir,
            project_id=project_id,
            canvas_id=canvas_id,
            event_type=event_type,
            actor=actor,
            payload=payload,
        )
    )


def generation_catalog_queries() -> GenerationCatalogQueries:
    from ai_anime.modules.creative_canvas.composition import (
        generation_catalog_queries as build,
    )

    return build()


def resolve_creative_canvas_vision_model(
    model_override: str | None = None,
) -> str:
    from ai_anime.modules.creative_canvas.composition import (
        resolve_creative_canvas_vision_model as resolve,
    )

    return resolve(model_override)


def creative_canvas_job_result_queries() -> CreativeCanvasJobResultQueries:
    from ai_anime.modules.creative_canvas.composition import (
        creative_canvas_job_result_queries as build,
    )

    return build()


def creative_canvas_job_workspace() -> CreativeCanvasJobWorkspace:
    from ai_anime.modules.creative_canvas.composition import (
        creative_canvas_job_workspace as build,
    )

    return build()


def creative_canvas_job_execution_use_cases() -> CreativeCanvasJobExecutionUseCases:
    from ai_anime.modules.creative_canvas.composition import (
        creative_canvas_job_execution_use_cases as build,
    )

    return build()


def creative_canvas_generation_history_use_cases() -> (
    CreativeCanvasGenerationHistoryUseCases
):
    from ai_anime.modules.creative_canvas.composition import (
        creative_canvas_generation_history_use_cases as build,
    )

    return build()


def creative_canvas_mainline_generation_use_cases() -> (
    CreativeCanvasMainlineGenerationUseCases
):
    from ai_anime.modules.creative_canvas.composition import (
        creative_canvas_mainline_generation_use_cases as build,
    )

    return build()


def creative_canvas_skill_catalog_queries() -> CreativeCanvasSkillCatalogQueries:
    from ai_anime.modules.creative_canvas.composition import (
        creative_canvas_skill_catalog_queries as build,
    )

    return build()


def creative_canvas_skill_run_use_cases() -> CreativeCanvasSkillRunUseCases:
    from ai_anime.modules.creative_canvas.composition import (
        creative_canvas_skill_run_use_cases as build,
    )

    return build()


def creative_canvas_staging_prop_use_cases() -> CreativeCanvasStagingPropUseCases:
    from ai_anime.modules.creative_canvas.composition import (
        creative_canvas_staging_prop_use_cases as build,
    )

    return build()


def creative_canvas_media_use_cases() -> CreativeCanvasMediaUseCases:
    from ai_anime.modules.creative_canvas.composition import (
        creative_canvas_media_use_cases as build,
    )

    return build()


def creative_canvas_mark_detection_use_cases() -> CreativeCanvasMarkDetectionUseCases:
    from ai_anime.modules.creative_canvas.composition import (
        creative_canvas_mark_detection_use_cases as build,
    )

    return build()


def creative_canvas_reverse_prompt_use_cases() -> CreativeCanvasReversePromptUseCases:
    from ai_anime.modules.creative_canvas.composition import (
        creative_canvas_reverse_prompt_use_cases as build,
    )

    return build()


def creative_canvas_reverse_prompt_execution_use_cases() -> (
    CreativeCanvasReversePromptExecutionUseCases
):
    from ai_anime.modules.creative_canvas.composition import (
        creative_canvas_reverse_prompt_execution_use_cases as build,
    )

    return build()


def creative_canvas_vision_analysis_use_cases() -> CreativeCanvasVisionAnalysisUseCases:
    from ai_anime.modules.creative_canvas.composition import (
        creative_canvas_vision_analysis_use_cases as build,
    )

    return build()


def creative_canvas_image_to_three_gs_use_cases() -> (
    CreativeCanvasImageToThreeGsUseCases
):
    from ai_anime.modules.creative_canvas.composition import (
        creative_canvas_image_to_three_gs_use_cases as build,
    )

    return build()


def creative_canvas_image_editing_use_cases() -> CreativeCanvasImageEditingUseCases:
    from ai_anime.modules.creative_canvas.composition import (
        creative_canvas_image_editing_use_cases as build,
    )

    return build()


def creative_canvas_reference_image_editing_use_cases() -> (
    CreativeCanvasImageEditingUseCases
):
    from ai_anime.modules.creative_canvas.composition import (
        creative_canvas_reference_image_editing_use_cases as build,
    )

    return build()


def creative_canvas_image_generation_use_cases() -> (
    CreativeCanvasImageGenerationUseCases
):
    from ai_anime.modules.creative_canvas.composition import (
        creative_canvas_image_generation_use_cases as build,
    )

    return build()


def creative_canvas_audio_generation_use_cases() -> (
    CreativeCanvasAudioGenerationUseCases
):
    from ai_anime.modules.creative_canvas.composition import (
        creative_canvas_audio_generation_use_cases as build,
    )

    return build()


async def generate_creative_canvas_audio_speech(
    *,
    store: Any,
    username: str,
    project: str,
    account_voice_username: str | None,
    project_dir: Path,
    job_id: str,
    model: str,
    text: str,
    emotion_prompt: str,
    voice_ref: dict[str, object] | None,
) -> CreativeCanvasGeneratedAudio:
    from ai_anime.modules.creative_canvas.infrastructure.audio_generation import (
        generate_freezone_audio_speech,
    )

    return await generate_freezone_audio_speech(
        store=store,
        username=username,
        project=project,
        account_voice_username=account_voice_username,
        project_dir=project_dir,
        job_id=job_id,
        model=model,
        text=text,
        emotion_prompt=emotion_prompt,
        voice_ref=voice_ref,
    )


async def generate_creative_canvas_audio_music(
    *,
    project_dir: Path,
    job_id: str,
    prompt: str,
    music_length_ms: int,
    force_instrumental: bool,
    respect_sections_durations: bool,
    output_format: str,
    response_format: str,
    model: str,
) -> CreativeCanvasGeneratedAudio:
    from ai_anime.modules.creative_canvas.infrastructure.audio_generation import (
        generate_freezone_audio_eleven_music,
    )

    return await generate_freezone_audio_eleven_music(
        project_dir=project_dir,
        job_id=job_id,
        prompt=prompt,
        music_length_ms=music_length_ms,
        force_instrumental=force_instrumental,
        respect_sections_durations=respect_sections_durations,
        output_format=output_format,
        response_format=response_format,
        model=model,
    )


def creative_canvas_audio_library_use_cases() -> CreativeCanvasAudioLibraryUseCases:
    from ai_anime.modules.creative_canvas.composition import (
        creative_canvas_audio_library_use_cases as build,
    )

    return build()


def creative_canvas_text_processing_use_cases() -> CreativeCanvasTextProcessingUseCases:
    from ai_anime.modules.creative_canvas.composition import (
        creative_canvas_text_processing_use_cases as build,
    )

    return build()


async def translate_creative_canvas_text(
    *,
    text: str,
    model: str,
    node_type: CreativeCanvasTextNodeType = "generic",
) -> tuple[str, Literal["zh", "en"], Literal["zh", "en"]]:
    from ai_anime.modules.creative_canvas.composition import (
        translate_creative_canvas_text as run,
    )

    return await run(text=text, model=model, node_type=node_type)


async def generate_creative_canvas_story_script(
    *,
    source_text: str,
    prompt: str = "",
    model: str,
) -> dict[str, object]:
    from ai_anime.modules.creative_canvas.composition import (
        generate_creative_canvas_story_script as run,
    )

    return await run(source_text=source_text, prompt=prompt, model=model)


def creative_canvas_video_processing_use_cases() -> (
    CreativeCanvasVideoProcessingUseCases
):
    from ai_anime.modules.creative_canvas.composition import (
        creative_canvas_video_processing_use_cases as build,
    )

    return build()


def creative_canvas_video_generation_use_cases() -> (
    CreativeCanvasVideoGenerationUseCases
):
    from ai_anime.modules.creative_canvas.composition import (
        creative_canvas_video_generation_use_cases as build,
    )

    return build()


def creative_canvas_video_asset_library_use_cases() -> (
    CreativeCanvasVideoAssetLibraryUseCases
):
    from ai_anime.modules.creative_canvas.composition import (
        creative_canvas_video_asset_library_use_cases as build,
    )

    return build()


__all__ = [
    "AnalyzeCreativeCanvasShotsJobCommand",
    "AnalyzeCreativeCanvasVisionCommand",
    "ComposeCreativeCanvasVideoJobCommand",
    "CreativeCanvasJobExecutionUseCases",
    "EditCreativeCanvasImageJobCommand",
    "EraseCreativeCanvasVideoJobCommand",
    "ExtractCreativeCanvasFramesJobCommand",
    "GenerateCreativeCanvasImageJobCommand",
    "GenerateCreativeCanvasVideoJobCommand",
    "MaskEditCreativeCanvasImageJobCommand",
    "SeparateCreativeCanvasAudioJobCommand",
    "UpscaleCreativeCanvasVideoJobCommand",
    "CREATIVE_CANVAS_PRESET_IMAGE_ASPECT_RATIOS",
    "PresetRef",
    "as_preset_list",
    "context_preset_sketch_aspect_ratio",
    "extract_preset_visual_markers",
    "normalize_preset_scene_name",
    "nearest_preset_image_aspect_ratio",
    "normalize_preset_image_aspect_ratio",
    "parse_preset_aspect_ratio",
    "preset_identity_character",
    "preset_identity_id",
    "preset_identity_name",
    "preset_prop_id",
    "preset_ref_mainline_context",
    "project_preset_sketch_aspect_ratio",
    "real_preset_identity_ids",
    "real_preset_prop_ids",
    "replace_preset_beat_markers",
    "MAINLINE_SCENE_360_IMAGE_SIZE",
    "BuildCreativeCanvasProjectionQuery",
    "CREATIVE_CANVAS_AUDIO_AGE_GROUP_LABELS",
    "SKILL_SCHEMA_VERSION",
    "CanvasGraphPatch",
    "CommitCreativeCanvasSlotCommand",
    "CopyCreativeCanvasSlotCommand",
    "CreateCreativeCanvasAudioVoiceCommand",
    "CreateCreativeCanvasPresetCommand",
    "CreativeCanvasAssetUseCases",
    "CreativeCanvasAudioGenerationUseCases",
    "CreativeCanvasGeneratedAudio",
    "CreativeCanvasGenerationHistoryUseCases",
    "CreativeCanvasAudioLibraryUseCases",
    "CreativeCanvasAudioVoiceMissing",
    "CreativeCanvasBootstrapBusy",
    "CreativeCanvasBootstrapCorrupt",
    "CreativeCanvasBootstrapResult",
    "CreativeCanvasBootstrapUseCases",
    "CreativeCanvasBeatNotFound",
    "CreativeCanvasDocumentBusy",
    "CreativeCanvasDocumentBaseRevisionRequired",
    "CreativeCanvasDocumentCommands",
    "CreativeCanvasDocumentCorrupt",
    "CreativeCanvasDocumentHistoryNotFound",
    "CreativeCanvasDocumentIdempotencyConflict",
    "CreativeCanvasDocumentQueries",
    "CreativeCanvasDocumentRevisionConflict",
    "CreativeCanvasDocumentStorageFailed",
    "CreativeCanvasDocumentWriteError",
    "CreativeCanvasEventActor",
    "CreativeCanvasEventRecorder",
    "CreativeCanvasSlotBeatNotFound",
    "CreativeCanvasSlotCommitUseCases",
    "CreativeCanvasSlotCopyResult",
    "CreativeCanvasSlotSourceNotFound",
    "CreativeCanvasProjectionCanvasNotFound",
    "CreativeCanvasProjectionUseCases",
    "CreativeCanvasPresetCanvasNotFound",
    "CreativeCanvasPresetMismatch",
    "CreativeCanvasPresetSourceNotFound",
    "CreativeCanvasPresetUseCases",
    "CreativeCanvasImageToThreeGsResult",
    "CreativeCanvasImageToThreeGsSourceMissing",
    "CreativeCanvasImageToThreeGsUseCases",
    "CreativeCanvasImageCameraConfig",
    "CreativeCanvasImageStyleConfig",
    "CreativeCanvasImageEditingSourceMissing",
    "CreativeCanvasImageEditingUseCases",
    "CreativeCanvasImageGenerationReferenceMissing",
    "CreativeCanvasImageGenerationUseCases",
    "CreativeCanvasJobResultQueries",
    "CreativeCanvasJobWorkspace",
    "CreativeCanvasJobType",
    "CreativeCanvasMainlineBeatMissing",
    "CreativeCanvasMainlineGenerationUseCases",
    "CreativeCanvasMainlineMediaMissing",
    "CreativeCanvasMediaUseCases",
    "CreativeCanvasMarkDetectionFailed",
    "CreativeCanvasMarkDetectionResult",
    "CreativeCanvasMarkDetectionUseCases",
    "CreativeCanvasMarkSelection",
    "CreativeCanvasReversePromptSourceMissing",
    "CreativeCanvasReversePromptExecutionUseCases",
    "CreativeCanvasReversePromptUseCases",
    "CreativeCanvasTaskReceipt",
    "CreativeCanvasTaskStartFailed",
    "CreativeCanvasTextProcessingSourceMissing",
    "CreativeCanvasTextProcessingUseCases",
    "CreativeCanvasTextNodeType",
    "CreativeCanvasOmniVideoReference",
    "CreativeCanvasVideoCharacterMissing",
    "CreativeCanvasVideoGenerationOptions",
    "CreativeCanvasVideoGenerationResult",
    "CreativeCanvasVideoGenerationUseCases",
    "CreativeCanvasVideoAssetLibraryUseCases",
    "CreativeCanvasVideoAssetMissing",
    "CreativeCanvasVideoAssetSourceMissing",
    "CreativeCanvasVideoAssetSyncResult",
    "CreativeCanvasVideoProcessingSourceMissing",
    "CreativeCanvasVideoProcessingUseCases",
    "CreativeCanvasVideoEraseMode",
    "CreativeCanvasVideoCompositionItem",
    "CreativeCanvasVideoCompositionTrack",
    "CreativeCanvasVisionAnalysisUseCases",
    "CreativeCanvasVisionInput",
    "CreativeCanvasScreenshotResult",
    "CreativeCanvasScreenshotTooLarge",
    "CreativeCanvasSkillCatalogQueries",
    "CreativeCanvasSkillRunRejected",
    "CreativeCanvasSkillRunUseCases",
    "CreativeCanvasStagingPropRejected",
    "CreativeCanvasStagingPropUseCases",
    "CreativeCanvasUploadResult",
    "GenerationCatalogQueries",
    "GenerateCreativeCanvasFrameFromContextCommand",
    "GenerateCreativeCanvasScene360Command",
    "GenerateCreativeCanvasSketchFromContextCommand",
    "GenerateCreativeCanvasStagingPropCommand",
    "GetCreativeCanvasDocumentQuery",
    "GetCreativeCanvasJobResultQuery",
    "GetCreativeCanvasDirectorCaptureQuery",
    "GetCreativeCanvasProjectionStatusQuery",
    "GetCreativeCanvasSlotImpactQuery",
    "GetCreativeCanvasSceneAssetsQuery",
    "GetCreativeCanvasSkillRunResultQuery",
    "GetCreativeCanvasAudioVoiceQuery",
    "DetectCreativeCanvasMarkCommand",
    "DangerousCreativeCanvasDocumentOverwrite",
    "DeleteCreativeCanvasDocumentCommand",
    "InvalidCreativeCanvasPngScreenshot",
    "InvalidCreativeCanvasSlotCommit",
    "InvalidCreativeCanvasPresetRequest",
    "InvalidCreativeCanvasAudioGenerationRequest",
    "InvalidCreativeCanvasAudioLibraryRequest",
    "InvalidCreativeCanvasBeatContextQuery",
    "InvalidCreativeCanvasDocumentQuery",
    "InvalidCreativeCanvasDocumentHistoryId",
    "InvalidCreativeCanvasImageToThreeGsRequest",
    "InvalidCreativeCanvasImageEditingRequest",
    "InvalidCreativeCanvasImageGenerationRequest",
    "InvalidCreativeCanvasMainlineGeneration",
    "InvalidCreativeCanvasImageSize",
    "InvalidCreativeCanvasImageTemplateMode",
    "InvalidCreativeCanvasMarkRequest",
    "InvalidCreativeCanvasReversePromptRequest",
    "InvalidCreativeCanvasTextProcessingRequest",
    "InvalidCreativeCanvasVideoProcessingRequest",
    "InvalidCreativeCanvasVideoGenerationRequest",
    "InvalidCreativeCanvasVideoAssetRequest",
    "InitializeCreativeCanvasCommand",
    "ListCreativeCanvasAudioReferencesQuery",
    "ListCreativeCanvasAssetsQuery",
    "ListCreativeCanvasBeatContextAssetsQuery",
    "ListCreativeCanvasDocumentHistoryQuery",
    "ListCreativeCanvasDocumentsQuery",
    "ListCreativeCanvasGenerationHistoryQuery",
    "ListCreativeCanvasNodeGenerationHistoryQuery",
    "RecordCreativeCanvasEventCommand",
    "RecordCreativeCanvasGenerationCommand",
    "ResolvedSkillInput",
    "RunCreativeCanvasSkillCommand",
    "ProjectCreativeCanvasProjectionCommand",
    "RemoveCreativeCanvasProjectionCommand",
    "RestoreCreativeCanvasDocumentCommand",
    "SaveCreativeCanvasScreenshotCommand",
    "SaveCreativeCanvasDocumentCommand",
    "StoreCreativeCanvasUploadCommand",
    "StartCreativeCanvasMusicGenerationCommand",
    "StartCreativeCanvasBackgroundSketchCommand",
    "StartCreativeCanvasBeatSketchCommand",
    "StartCreativeCanvasDirectorSketchCommand",
    "StartCreativeCanvasFrameFromContextCommand",
    "StartCreativeCanvasScene360Command",
    "StartCreativeCanvasSpeechGenerationCommand",
    "StartCreativeCanvasAudioSeparationCommand",
    "StartCreativeCanvasReversePromptCommand",
    "StartCreativeCanvasImageToThreeGsCommand",
    "StartCreativeCanvasImageEditingCommand",
    "StartCreativeCanvasReferenceImageEditingCommand",
    "StartCreativeCanvasImageGenerationCommand",
    "StartCreativeCanvasStoryScriptCommand",
    "StartCreativeCanvasTextTranslationCommand",
    "StartCreativeCanvasFrameExtractionCommand",
    "StartCreativeCanvasImageVideoCommand",
    "StartCreativeCanvasKeyframeVideoCommand",
    "StartCreativeCanvasOmniVideoCommand",
    "StartCreativeCanvasShotAnalysisCommand",
    "StartCreativeCanvasVideoEraseCommand",
    "StartCreativeCanvasVideoCompositionCommand",
    "StartCreativeCanvasVideoUpscaleCommand",
    "StartCreativeCanvasTextVideoCommand",
    "StartCreativeCanvasVideoEditCommand",
    "StartCreativeCanvasVideoStoryAnalysisCommand",
    "SkillDefinition",
    "SkillErrorEnvelope",
    "SkillInputAcceptSpec",
    "SkillRunOutput",
    "SkillRunRequest",
    "SkillRunResponse",
    "SkillRunResult",
    "AddCreativeCanvasVideoAssetCommand",
    "SyncCreativeCanvasVideoAssetsCommand",
    "SyncCreativeCanvasDirectorBackgroundCommand",
    "canvas_actor_id",
    "canvas_event_actor",
    "canvas_id_for_preset",
    "build_image_multi_view_prompt",
    "beat_context_as_prompt_beat",
    "build_scene_360_prompt",
    "build_image_relight_prompt",
    "build_image_template_edit_prompt",
    "build_freezone_image_to_video_prompt",
    "build_freezone_keyframe_video_prompt",
    "build_freezone_omni_video_prompt",
    "build_freezone_video_prompt",
    "build_creative_canvas_video_upscale_filter",
    "build_video_story_analysis_prompt",
    "creative_canvas_audio_generation_use_cases",
    "generate_creative_canvas_audio_music",
    "generate_creative_canvas_audio_speech",
    "creative_canvas_audio_library_use_cases",
    "creative_canvas_bootstrap_use_cases",
    "creative_canvas_write_lock",
    "creative_canvas_asset_use_cases",
    "creative_canvas_document_commands",
    "creative_canvas_document_queries",
    "creative_canvas_event_recorder",
    "creative_canvas_slot_commit_use_cases",
    "creative_canvas_skill_catalog_queries",
    "creative_canvas_skill_run_use_cases",
    "creative_canvas_staging_prop_use_cases",
    "creative_canvas_preset_use_cases",
    "creative_canvas_projection_use_cases",
    "creative_canvas_mark_detection_use_cases",
    "creative_canvas_image_to_three_gs_use_cases",
    "creative_canvas_image_editing_use_cases",
    "creative_canvas_reference_image_editing_use_cases",
    "creative_canvas_image_generation_use_cases",
    "creative_canvas_generation_history_use_cases",
    "creative_canvas_job_result_queries",
    "creative_canvas_job_workspace",
    "creative_canvas_job_execution_use_cases",
    "creative_canvas_mainline_generation_use_cases",
    "creative_canvas_text_processing_use_cases",
    "generate_creative_canvas_story_script",
    "creative_canvas_video_processing_use_cases",
    "creative_canvas_video_generation_use_cases",
    "creative_canvas_video_asset_library_use_cases",
    "creative_canvas_reverse_prompt_use_cases",
    "creative_canvas_reverse_prompt_execution_use_cases",
    "creative_canvas_vision_analysis_use_cases",
    "creative_canvas_image_media_type",
    "creative_canvas_media_use_cases",
    "detected_reference_ids_from_beat_context_data",
    "default_push_target_for_preset",
    "first_text_value",
    "generation_catalog_queries",
    "get_video_camera_template",
    "get_video_camera_templates",
    "is_preset_managed_canvas_node",
    "infer_scene_id_from_master_path",
    "is_standalone_beat_context",
    "merge_projected_preset_canvas",
    "merge_restored_preset_canvas",
    "normalize_mainline_aspect_ratio",
    "normalize_mainline_frame_quality",
    "preset_facts_signature",
    "preset_facts_signature_from_payload",
    "preset_key_for_request",
    "prepare_creative_canvas_payload_for_write",
    "public_creative_canvas_video_story_result",
    "projection_facts_signature_from_payload",
    "projection_group_label",
    "normalize_video_aspect_ratio",
    "normalize_video_resolution",
    "resolve_original_image_aspect_ratio",
    "safe_creative_canvas_identifier_fragment",
    "resolve_image_template_aspect_ratio",
    "remove_projected_preset_canvas",
    "record_creative_canvas_event",
    "standalone_character_map",
    "standalone_prop_marker_colors",
    "standalone_sketch_colors",
    "summarize_omni_reference_counts",
    "stamp_canvas_mainline_context_project_id",
    "stamp_preset_facts_signature",
    "stamp_projection_key",
    "stamp_projection_metadata",
    "sync_frame_context_reference_edges",
    "translate_creative_canvas_text",
    "validate_omni_reference_limits",
    "validate_video_composition_media_item_count",
    "validate_video_composition_source_range",
    "validate_video_composition_track_count",
    "validate_video_composition_video_item_count",
    "validate_video_erase_box",
    "wrap_projection_payload_in_group",
]
