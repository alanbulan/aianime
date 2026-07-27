"""Stable application API exposed by Creative Canvas."""

from collections.abc import Mapping
from pathlib import Path
from typing import Any

from ai_anime.modules.creative_canvas.application.audio_generation import (
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
    DEFAULT_CREATIVE_CANVAS_IMAGE_MODEL,
    SUPPORTED_CREATIVE_CANVAS_IMAGE_PROVIDERS,
    CreativeCanvasImageCameraConfig,
    CreativeCanvasImageStyleConfig,
    CreativeCanvasEventActor,
    CreativeCanvasMarkSelection,
    CreativeCanvasScreenshotTooLarge,
    CreativeCanvasVideoEraseMode,
    InvalidCreativeCanvasImageSize,
    InvalidCreativeCanvasImageTemplateMode,
    UnsupportedCreativeCanvasImageProvider,
    InvalidCreativeCanvasPngScreenshot,
    canvas_actor_id,
    canvas_event_actor,
    build_image_multi_view_prompt,
    build_image_relight_prompt,
    build_image_template_edit_prompt,
    build_freezone_image_to_video_prompt,
    build_freezone_keyframe_video_prompt,
    build_freezone_omni_video_prompt,
    build_freezone_video_prompt,
    detected_reference_ids_from_beat_context_data,
    first_text_value,
    get_video_camera_template,
    get_video_camera_templates,
    is_preset_managed_canvas_node,
    merge_projected_preset_canvas,
    merge_restored_preset_canvas,
    prepare_creative_canvas_payload_for_write,
    normalize_video_aspect_ratio,
    normalize_video_resolution,
    resolve_image_template_aspect_ratio,
    remove_projected_preset_canvas,
    resolve_original_image_aspect_ratio,
    resolve_image_provider,
    summarize_omni_reference_counts,
    stamp_canvas_mainline_context_project_id,
    sync_frame_context_reference_edges,
    validate_omni_reference_limits,
    validate_video_composition_media_item_count,
    validate_video_composition_source_range,
    validate_video_composition_track_count,
    validate_video_composition_video_item_count,
    validate_video_erase_box,
    wrap_projection_payload_in_group,
)


def creative_canvas_bootstrap_use_cases() -> CreativeCanvasBootstrapUseCases:
    from ai_anime.modules.creative_canvas.composition import (
        creative_canvas_bootstrap_use_cases as build,
    )

    return build()


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


def creative_canvas_event_recorder() -> CreativeCanvasEventRecorder:
    from ai_anime.modules.creative_canvas.composition import (
        creative_canvas_event_recorder as build,
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


def translate_creative_canvas_document_write_error(exc: Exception) -> Exception:
    from ai_anime.modules.creative_canvas.infrastructure.canvas_writes import (
        translate_canvas_store_error,
    )

    return translate_canvas_store_error(exc)


def generation_catalog_queries() -> GenerationCatalogQueries:
    from ai_anime.modules.creative_canvas.composition import (
        generation_catalog_queries as build,
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


def creative_canvas_image_to_three_gs_use_cases() -> CreativeCanvasImageToThreeGsUseCases:
    from ai_anime.modules.creative_canvas.composition import (
        creative_canvas_image_to_three_gs_use_cases as build,
    )

    return build()


def creative_canvas_image_editing_use_cases() -> CreativeCanvasImageEditingUseCases:
    from ai_anime.modules.creative_canvas.composition import (
        creative_canvas_image_editing_use_cases as build,
    )

    return build()


def creative_canvas_reference_image_editing_use_cases() -> CreativeCanvasImageEditingUseCases:
    from ai_anime.modules.creative_canvas.composition import (
        creative_canvas_reference_image_editing_use_cases as build,
    )

    return build()


def creative_canvas_image_generation_use_cases() -> CreativeCanvasImageGenerationUseCases:
    from ai_anime.modules.creative_canvas.composition import (
        creative_canvas_image_generation_use_cases as build,
    )

    return build()


def creative_canvas_audio_generation_use_cases() -> CreativeCanvasAudioGenerationUseCases:
    from ai_anime.modules.creative_canvas.composition import (
        creative_canvas_audio_generation_use_cases as build,
    )

    return build()


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


def creative_canvas_video_processing_use_cases() -> CreativeCanvasVideoProcessingUseCases:
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


def is_seedance2_video_backend(backend: str | None) -> bool:
    from ai_anime.modules.creative_canvas.composition import (
        creative_canvas_video_model_policy,
    )

    return creative_canvas_video_model_policy().is_seedance2_backend(backend)


__all__ = [
    "CREATIVE_CANVAS_AUDIO_AGE_GROUP_LABELS",
    "DEFAULT_CREATIVE_CANVAS_IMAGE_MODEL",
    "CreateCreativeCanvasAudioVoiceCommand",
    "CreativeCanvasAudioGenerationUseCases",
    "CreativeCanvasAudioLibraryUseCases",
    "CreativeCanvasAudioVoiceMissing",
    "CreativeCanvasBootstrapBusy",
    "CreativeCanvasBootstrapCorrupt",
    "CreativeCanvasBootstrapResult",
    "CreativeCanvasBootstrapUseCases",
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
    "CreativeCanvasImageToThreeGsResult",
    "CreativeCanvasImageToThreeGsSourceMissing",
    "CreativeCanvasImageToThreeGsUseCases",
    "CreativeCanvasImageCameraConfig",
    "CreativeCanvasImageStyleConfig",
    "SUPPORTED_CREATIVE_CANVAS_IMAGE_PROVIDERS",
    "CreativeCanvasImageEditingSourceMissing",
    "CreativeCanvasImageEditingUseCases",
    "CreativeCanvasImageGenerationReferenceMissing",
    "CreativeCanvasImageGenerationUseCases",
    "CreativeCanvasMediaUseCases",
    "CreativeCanvasMarkDetectionFailed",
    "CreativeCanvasMarkDetectionResult",
    "CreativeCanvasMarkDetectionUseCases",
    "CreativeCanvasMarkSelection",
    "CreativeCanvasReversePromptSourceMissing",
    "CreativeCanvasReversePromptUseCases",
    "CreativeCanvasTaskReceipt",
    "CreativeCanvasTaskStartFailed",
    "CreativeCanvasTextProcessingSourceMissing",
    "CreativeCanvasTextProcessingUseCases",
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
    "CreativeCanvasScreenshotResult",
    "CreativeCanvasScreenshotTooLarge",
    "CreativeCanvasUploadResult",
    "GenerationCatalogQueries",
    "GetCreativeCanvasDocumentQuery",
    "GetCreativeCanvasAudioVoiceQuery",
    "DetectCreativeCanvasMarkCommand",
    "DangerousCreativeCanvasDocumentOverwrite",
    "DeleteCreativeCanvasDocumentCommand",
    "InvalidCreativeCanvasPngScreenshot",
    "InvalidCreativeCanvasAudioGenerationRequest",
    "InvalidCreativeCanvasAudioLibraryRequest",
    "InvalidCreativeCanvasDocumentQuery",
    "InvalidCreativeCanvasDocumentHistoryId",
    "InvalidCreativeCanvasImageToThreeGsRequest",
    "InvalidCreativeCanvasImageEditingRequest",
    "InvalidCreativeCanvasImageGenerationRequest",
    "InvalidCreativeCanvasImageSize",
    "InvalidCreativeCanvasImageTemplateMode",
    "UnsupportedCreativeCanvasImageProvider",
    "InvalidCreativeCanvasMarkRequest",
    "InvalidCreativeCanvasReversePromptRequest",
    "InvalidCreativeCanvasTextProcessingRequest",
    "InvalidCreativeCanvasVideoProcessingRequest",
    "InvalidCreativeCanvasVideoGenerationRequest",
    "InvalidCreativeCanvasVideoAssetRequest",
    "InitializeCreativeCanvasCommand",
    "ListCreativeCanvasAudioReferencesQuery",
    "ListCreativeCanvasDocumentHistoryQuery",
    "ListCreativeCanvasDocumentsQuery",
    "ListCreativeCanvasGenerationHistoryQuery",
    "ListCreativeCanvasNodeGenerationHistoryQuery",
    "RecordCreativeCanvasEventCommand",
    "RestoreCreativeCanvasDocumentCommand",
    "SaveCreativeCanvasScreenshotCommand",
    "SaveCreativeCanvasDocumentCommand",
    "StoreCreativeCanvasUploadCommand",
    "StartCreativeCanvasMusicGenerationCommand",
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
    "AddCreativeCanvasVideoAssetCommand",
    "SyncCreativeCanvasVideoAssetsCommand",
    "canvas_actor_id",
    "canvas_event_actor",
    "build_image_multi_view_prompt",
    "build_image_relight_prompt",
    "build_image_template_edit_prompt",
    "build_freezone_image_to_video_prompt",
    "build_freezone_keyframe_video_prompt",
    "build_freezone_omni_video_prompt",
    "build_freezone_video_prompt",
    "creative_canvas_audio_generation_use_cases",
    "creative_canvas_audio_library_use_cases",
    "creative_canvas_bootstrap_use_cases",
    "creative_canvas_document_commands",
    "creative_canvas_document_queries",
    "creative_canvas_event_recorder",
    "creative_canvas_mark_detection_use_cases",
    "creative_canvas_image_to_three_gs_use_cases",
    "creative_canvas_image_editing_use_cases",
    "creative_canvas_reference_image_editing_use_cases",
    "creative_canvas_image_generation_use_cases",
    "creative_canvas_text_processing_use_cases",
    "creative_canvas_video_processing_use_cases",
    "creative_canvas_video_generation_use_cases",
    "creative_canvas_video_asset_library_use_cases",
    "creative_canvas_reverse_prompt_use_cases",
    "creative_canvas_media_use_cases",
    "detected_reference_ids_from_beat_context_data",
    "first_text_value",
    "generation_catalog_queries",
    "get_video_camera_template",
    "get_video_camera_templates",
    "is_seedance2_video_backend",
    "is_preset_managed_canvas_node",
    "merge_projected_preset_canvas",
    "merge_restored_preset_canvas",
    "prepare_creative_canvas_payload_for_write",
    "normalize_video_aspect_ratio",
    "normalize_video_resolution",
    "resolve_original_image_aspect_ratio",
    "resolve_image_provider",
    "resolve_image_template_aspect_ratio",
    "remove_projected_preset_canvas",
    "record_creative_canvas_event",
    "summarize_omni_reference_counts",
    "stamp_canvas_mainline_context_project_id",
    "sync_frame_context_reference_edges",
    "translate_creative_canvas_document_write_error",
    "validate_omni_reference_limits",
    "validate_video_composition_media_item_count",
    "validate_video_composition_source_range",
    "validate_video_composition_track_count",
    "validate_video_composition_video_item_count",
    "validate_video_erase_box",
    "wrap_projection_payload_in_group",
]
