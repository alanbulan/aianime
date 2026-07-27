"""Creative Canvas application composition."""

from functools import lru_cache

from ai_anime.modules.creative_canvas.application.bootstrap import (
    CreativeCanvasBootstrapUseCases,
)
from ai_anime.modules.creative_canvas.application.generation_catalog import (
    GenerationCatalogQueries,
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
from ai_anime.modules.creative_canvas.infrastructure.media import (
    FreezoneJobIdGenerator,
    LocalCreativeCanvasMediaStorage,
)
from ai_anime.modules.creative_canvas.infrastructure.mark_detection import (
    FreezoneVisionMarkDetector,
)
from ai_anime.modules.creative_canvas.infrastructure.reverse_prompt import (
    TaskBackendCreativeCanvasReversePromptScheduler,
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
        TaskBackendCreativeCanvasReversePromptScheduler(get_task_backend),
    )
