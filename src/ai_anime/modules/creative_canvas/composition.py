"""Creative Canvas application composition."""

from functools import lru_cache

from ai_anime.modules.creative_canvas.application.bootstrap import (
    CreativeCanvasBootstrapUseCases,
)
from ai_anime.modules.creative_canvas.application.generation_catalog import (
    GenerationCatalogQueries,
)
from ai_anime.modules.creative_canvas.application.image_to_3gs import (
    CreativeCanvasImageToThreeGsUseCases,
)
from ai_anime.modules.creative_canvas.application.image_editing import (
    CreativeCanvasImageEditingUseCases,
)
from ai_anime.modules.creative_canvas.application.media import (
    CreativeCanvasMediaUseCases,
)
from ai_anime.modules.creative_canvas.application.mark_detection import (
    CreativeCanvasMarkDetectionUseCases,
)
from ai_anime.modules.creative_canvas.application.reverse_prompt import (
    CreativeCanvasReversePromptUseCases,
)
from ai_anime.ports import get_task_backend
from ai_anime.modules.creative_canvas.infrastructure.bootstrap import (
    LocalCreativeCanvasBootstrapStorage,
)
from ai_anime.modules.creative_canvas.infrastructure.generation_catalog import (
    ConfiguredGenerationCatalogSource,
)
from ai_anime.modules.creative_canvas.infrastructure.image_sources import (
    ProjectCreativeCanvasImageSourceResolver,
)
from ai_anime.modules.creative_canvas.infrastructure.image_editing import (
    FreezoneCreativeCanvasImageEditingPromptComposer,
    FreezoneCreativeCanvasImageModelRouter,
    PillowCreativeCanvasImageEditingStorage,
)
from ai_anime.modules.creative_canvas.infrastructure.media import (
    FreezoneJobIdGenerator,
    LocalCreativeCanvasMediaStorage,
)
from ai_anime.modules.creative_canvas.infrastructure.mark_detection import (
    FreezoneVisionMarkDetector,
)
from ai_anime.modules.creative_canvas.infrastructure.task_submission import (
    TaskBackendCreativeCanvasTaskScheduler,
)


@lru_cache(maxsize=1)
def creative_canvas_bootstrap_use_cases() -> CreativeCanvasBootstrapUseCases:
    return CreativeCanvasBootstrapUseCases(LocalCreativeCanvasBootstrapStorage())


@lru_cache(maxsize=1)
def generation_catalog_queries() -> GenerationCatalogQueries:
    return GenerationCatalogQueries(ConfiguredGenerationCatalogSource())


@lru_cache(maxsize=1)
def creative_canvas_media_use_cases() -> CreativeCanvasMediaUseCases:
    return CreativeCanvasMediaUseCases(
        LocalCreativeCanvasMediaStorage(),
        FreezoneJobIdGenerator(),
    )


@lru_cache(maxsize=1)
def creative_canvas_mark_detection_use_cases() -> CreativeCanvasMarkDetectionUseCases:
    return CreativeCanvasMarkDetectionUseCases(
        ProjectCreativeCanvasImageSourceResolver(),
        FreezoneVisionMarkDetector(),
    )


@lru_cache(maxsize=1)
def creative_canvas_reverse_prompt_use_cases() -> CreativeCanvasReversePromptUseCases:
    return CreativeCanvasReversePromptUseCases(
        ProjectCreativeCanvasImageSourceResolver(),
        FreezoneJobIdGenerator(),
        TaskBackendCreativeCanvasTaskScheduler(get_task_backend),
    )


@lru_cache(maxsize=1)
def creative_canvas_image_to_three_gs_use_cases() -> CreativeCanvasImageToThreeGsUseCases:
    return CreativeCanvasImageToThreeGsUseCases(
        ProjectCreativeCanvasImageSourceResolver(),
        FreezoneJobIdGenerator(),
        TaskBackendCreativeCanvasTaskScheduler(get_task_backend),
    )


@lru_cache(maxsize=1)
def creative_canvas_image_editing_use_cases() -> CreativeCanvasImageEditingUseCases:
    return CreativeCanvasImageEditingUseCases(
        ProjectCreativeCanvasImageSourceResolver(),
        PillowCreativeCanvasImageEditingStorage(),
        FreezoneCreativeCanvasImageEditingPromptComposer(),
        FreezoneCreativeCanvasImageModelRouter(),
        FreezoneJobIdGenerator(),
        TaskBackendCreativeCanvasTaskScheduler(get_task_backend),
    )
