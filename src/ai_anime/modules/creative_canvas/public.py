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
    CreativeCanvasReversePromptStartFailed,
    CreativeCanvasReversePromptTaskReceipt,
    CreativeCanvasReversePromptUseCases,
    InvalidCreativeCanvasReversePromptRequest,
    StartCreativeCanvasReversePromptCommand,
)
from ai_anime.modules.creative_canvas.domain import (
    CreativeCanvasMarkSelection,
    CreativeCanvasScreenshotTooLarge,
    InvalidCreativeCanvasPngScreenshot,
    canvas_actor_id,
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


__all__ = [
    "CreativeCanvasBootstrapBusy",
    "CreativeCanvasBootstrapCorrupt",
    "CreativeCanvasBootstrapResult",
    "CreativeCanvasBootstrapUseCases",
    "CreativeCanvasMediaUseCases",
    "CreativeCanvasMarkDetectionFailed",
    "CreativeCanvasMarkDetectionResult",
    "CreativeCanvasMarkDetectionUseCases",
    "CreativeCanvasMarkSelection",
    "CreativeCanvasReversePromptSourceMissing",
    "CreativeCanvasReversePromptStartFailed",
    "CreativeCanvasReversePromptTaskReceipt",
    "CreativeCanvasReversePromptUseCases",
    "CreativeCanvasScreenshotResult",
    "CreativeCanvasScreenshotTooLarge",
    "CreativeCanvasUploadResult",
    "GenerationCatalogQueries",
    "DetectCreativeCanvasMarkCommand",
    "InvalidCreativeCanvasPngScreenshot",
    "InvalidCreativeCanvasMarkRequest",
    "InvalidCreativeCanvasReversePromptRequest",
    "InitializeCreativeCanvasCommand",
    "SaveCreativeCanvasScreenshotCommand",
    "StoreCreativeCanvasUploadCommand",
    "StartCreativeCanvasReversePromptCommand",
    "canvas_actor_id",
    "creative_canvas_bootstrap_use_cases",
    "creative_canvas_mark_detection_use_cases",
    "creative_canvas_reverse_prompt_use_cases",
    "creative_canvas_media_use_cases",
    "generation_catalog_queries",
]
