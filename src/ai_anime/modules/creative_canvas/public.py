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
    StartCreativeCanvasVideoStoryAnalysisCommand,
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
    resolve_image_template_aspect_ratio,
    resolve_original_image_aspect_ratio,
    resolve_image_provider,
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
    "InitializeCreativeCanvasCommand",
    "SaveCreativeCanvasScreenshotCommand",
    "StoreCreativeCanvasUploadCommand",
    "StartCreativeCanvasReversePromptCommand",
    "StartCreativeCanvasImageToThreeGsCommand",
    "StartCreativeCanvasImageEditingCommand",
    "StartCreativeCanvasReferenceImageEditingCommand",
    "StartCreativeCanvasImageGenerationCommand",
    "StartCreativeCanvasFrameExtractionCommand",
    "StartCreativeCanvasShotAnalysisCommand",
    "StartCreativeCanvasVideoStoryAnalysisCommand",
    "canvas_actor_id",
    "build_image_multi_view_prompt",
    "build_image_relight_prompt",
    "build_image_template_edit_prompt",
    "creative_canvas_bootstrap_use_cases",
    "creative_canvas_mark_detection_use_cases",
    "creative_canvas_image_to_three_gs_use_cases",
    "creative_canvas_image_editing_use_cases",
    "creative_canvas_reference_image_editing_use_cases",
    "creative_canvas_image_generation_use_cases",
    "creative_canvas_video_processing_use_cases",
    "creative_canvas_reverse_prompt_use_cases",
    "creative_canvas_media_use_cases",
    "generation_catalog_queries",
    "resolve_original_image_aspect_ratio",
    "resolve_image_provider",
    "resolve_image_template_aspect_ratio",
]
