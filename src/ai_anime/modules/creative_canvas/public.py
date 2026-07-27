"""Stable application API exposed by Creative Canvas."""

from ai_anime.modules.creative_canvas.application.bootstrap import (
    CreativeCanvasBootstrapBusy,
    CreativeCanvasBootstrapCorrupt,
    CreativeCanvasBootstrapResult,
    CreativeCanvasBootstrapUseCases,
    InitializeCreativeCanvasCommand,
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
from ai_anime.modules.creative_canvas.application.video_processing import (
    CreativeCanvasVideoProcessingSourceMissing,
    CreativeCanvasVideoProcessingUseCases,
    InvalidCreativeCanvasVideoProcessingRequest,
    StartCreativeCanvasFrameExtractionCommand,
    StartCreativeCanvasShotAnalysisCommand,
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
    DEFAULT_CREATIVE_CANVAS_IMAGE_MODEL,
    SUPPORTED_CREATIVE_CANVAS_IMAGE_PROVIDERS,
    CreativeCanvasImageCameraConfig,
    CreativeCanvasImageStyleConfig,
    CreativeCanvasMarkSelection,
    CreativeCanvasScreenshotTooLarge,
    InvalidCreativeCanvasImageSize,
    InvalidCreativeCanvasImageTemplateMode,
    UnsupportedCreativeCanvasImageProvider,
    InvalidCreativeCanvasPngScreenshot,
    canvas_actor_id,
    build_image_multi_view_prompt,
    build_image_relight_prompt,
    build_image_template_edit_prompt,
    build_freezone_image_to_video_prompt,
    build_freezone_keyframe_video_prompt,
    build_freezone_omni_video_prompt,
    build_freezone_video_prompt,
    get_video_camera_template,
    get_video_camera_templates,
    normalize_video_aspect_ratio,
    normalize_video_resolution,
    resolve_image_template_aspect_ratio,
    resolve_original_image_aspect_ratio,
    resolve_image_provider,
    summarize_omni_reference_counts,
    validate_omni_reference_limits,
)


def creative_canvas_bootstrap_use_cases() -> CreativeCanvasBootstrapUseCases:
    from ai_anime.modules.creative_canvas.composition import (
        creative_canvas_bootstrap_use_cases as build,
    )

    return build()


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
    "DEFAULT_CREATIVE_CANVAS_IMAGE_MODEL",
    "CreativeCanvasBootstrapBusy",
    "CreativeCanvasBootstrapCorrupt",
    "CreativeCanvasBootstrapResult",
    "CreativeCanvasBootstrapUseCases",
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
    "CreativeCanvasScreenshotResult",
    "CreativeCanvasScreenshotTooLarge",
    "CreativeCanvasUploadResult",
    "GenerationCatalogQueries",
    "DetectCreativeCanvasMarkCommand",
    "InvalidCreativeCanvasPngScreenshot",
    "InvalidCreativeCanvasImageToThreeGsRequest",
    "InvalidCreativeCanvasImageEditingRequest",
    "InvalidCreativeCanvasImageGenerationRequest",
    "InvalidCreativeCanvasImageSize",
    "InvalidCreativeCanvasImageTemplateMode",
    "UnsupportedCreativeCanvasImageProvider",
    "InvalidCreativeCanvasMarkRequest",
    "InvalidCreativeCanvasReversePromptRequest",
    "InvalidCreativeCanvasVideoProcessingRequest",
    "InvalidCreativeCanvasVideoGenerationRequest",
    "InvalidCreativeCanvasVideoAssetRequest",
    "InitializeCreativeCanvasCommand",
    "SaveCreativeCanvasScreenshotCommand",
    "StoreCreativeCanvasUploadCommand",
    "StartCreativeCanvasReversePromptCommand",
    "StartCreativeCanvasImageToThreeGsCommand",
    "StartCreativeCanvasImageEditingCommand",
    "StartCreativeCanvasReferenceImageEditingCommand",
    "StartCreativeCanvasImageGenerationCommand",
    "StartCreativeCanvasFrameExtractionCommand",
    "StartCreativeCanvasImageVideoCommand",
    "StartCreativeCanvasKeyframeVideoCommand",
    "StartCreativeCanvasOmniVideoCommand",
    "StartCreativeCanvasShotAnalysisCommand",
    "StartCreativeCanvasVideoUpscaleCommand",
    "StartCreativeCanvasTextVideoCommand",
    "StartCreativeCanvasVideoEditCommand",
    "StartCreativeCanvasVideoStoryAnalysisCommand",
    "AddCreativeCanvasVideoAssetCommand",
    "SyncCreativeCanvasVideoAssetsCommand",
    "canvas_actor_id",
    "build_image_multi_view_prompt",
    "build_image_relight_prompt",
    "build_image_template_edit_prompt",
    "build_freezone_image_to_video_prompt",
    "build_freezone_keyframe_video_prompt",
    "build_freezone_omni_video_prompt",
    "build_freezone_video_prompt",
    "creative_canvas_bootstrap_use_cases",
    "creative_canvas_mark_detection_use_cases",
    "creative_canvas_image_to_three_gs_use_cases",
    "creative_canvas_image_editing_use_cases",
    "creative_canvas_reference_image_editing_use_cases",
    "creative_canvas_image_generation_use_cases",
    "creative_canvas_video_processing_use_cases",
    "creative_canvas_video_generation_use_cases",
    "creative_canvas_video_asset_library_use_cases",
    "creative_canvas_reverse_prompt_use_cases",
    "creative_canvas_media_use_cases",
    "generation_catalog_queries",
    "get_video_camera_template",
    "get_video_camera_templates",
    "is_seedance2_video_backend",
    "normalize_video_aspect_ratio",
    "normalize_video_resolution",
    "resolve_original_image_aspect_ratio",
    "resolve_image_provider",
    "resolve_image_template_aspect_ratio",
    "summarize_omni_reference_counts",
    "validate_omni_reference_limits",
]
