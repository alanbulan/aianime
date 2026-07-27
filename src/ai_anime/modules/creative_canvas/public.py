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
from ai_anime.modules.creative_canvas.domain import (
    CreativeCanvasImageCameraConfig,
    CreativeCanvasImageStyleConfig,
    CreativeCanvasMarkSelection,
    CreativeCanvasScreenshotTooLarge,
    InvalidCreativeCanvasImageSize,
    InvalidCreativeCanvasPngScreenshot,
    canvas_actor_id,
    resolve_original_image_aspect_ratio,
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


__all__ = [
    "CreativeCanvasBootstrapBusy",
    "CreativeCanvasBootstrapCorrupt",
    "CreativeCanvasBootstrapResult",
    "CreativeCanvasBootstrapUseCases",
    "CreativeCanvasImageToThreeGsResult",
    "CreativeCanvasImageToThreeGsSourceMissing",
    "CreativeCanvasImageToThreeGsUseCases",
    "CreativeCanvasImageCameraConfig",
    "CreativeCanvasImageStyleConfig",
    "CreativeCanvasImageEditingSourceMissing",
    "CreativeCanvasImageEditingUseCases",
    "CreativeCanvasMediaUseCases",
    "CreativeCanvasMarkDetectionFailed",
    "CreativeCanvasMarkDetectionResult",
    "CreativeCanvasMarkDetectionUseCases",
    "CreativeCanvasMarkSelection",
    "CreativeCanvasReversePromptSourceMissing",
    "CreativeCanvasReversePromptUseCases",
    "CreativeCanvasTaskReceipt",
    "CreativeCanvasTaskStartFailed",
    "CreativeCanvasScreenshotResult",
    "CreativeCanvasScreenshotTooLarge",
    "CreativeCanvasUploadResult",
    "GenerationCatalogQueries",
    "DetectCreativeCanvasMarkCommand",
    "InvalidCreativeCanvasPngScreenshot",
    "InvalidCreativeCanvasImageToThreeGsRequest",
    "InvalidCreativeCanvasImageEditingRequest",
    "InvalidCreativeCanvasImageSize",
    "InvalidCreativeCanvasMarkRequest",
    "InvalidCreativeCanvasReversePromptRequest",
    "InitializeCreativeCanvasCommand",
    "SaveCreativeCanvasScreenshotCommand",
    "StoreCreativeCanvasUploadCommand",
    "StartCreativeCanvasReversePromptCommand",
    "StartCreativeCanvasImageToThreeGsCommand",
    "StartCreativeCanvasImageEditingCommand",
    "canvas_actor_id",
    "creative_canvas_bootstrap_use_cases",
    "creative_canvas_mark_detection_use_cases",
    "creative_canvas_image_to_three_gs_use_cases",
    "creative_canvas_image_editing_use_cases",
    "creative_canvas_reverse_prompt_use_cases",
    "creative_canvas_media_use_cases",
    "generation_catalog_queries",
    "resolve_original_image_aspect_ratio",
]
