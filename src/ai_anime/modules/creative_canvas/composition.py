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
    CreativeCanvasReversePromptUseCases,
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
from ai_anime.ports import get_task_backend
from ai_anime.modules.creative_canvas.infrastructure.bootstrap import (
    LocalCreativeCanvasBootstrapStorage,
)
from ai_anime.modules.creative_canvas.infrastructure.generation_catalog import (
    ConfiguredGenerationCatalogSource,
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
from ai_anime.modules.creative_canvas.infrastructure.mark_detection import (
    FreezoneVisionMarkDetector,
)
from ai_anime.modules.creative_canvas.infrastructure.task_submission import (
    TaskBackendCreativeCanvasTaskScheduler,
)
from ai_anime.modules.creative_canvas.infrastructure.video_generation import (
    ConfiguredCreativeCanvasVideoModelPolicy,
)
from ai_anime.modules.creative_canvas.infrastructure.video_asset_library import (
    LocalCreativeCanvasVideoAssetRepository,
    ProjectCreativeCanvasMainlineVideoAssetSource,
    SystemCreativeCanvasClock,
    UuidCreativeCanvasVideoAssetIdGenerator,
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
        ProjectCreativeCanvasMediaSourceResolver(),
        FreezoneVisionMarkDetector(),
    )


@lru_cache(maxsize=1)
def creative_canvas_reverse_prompt_use_cases() -> CreativeCanvasReversePromptUseCases:
    return CreativeCanvasReversePromptUseCases(
        ProjectCreativeCanvasMediaSourceResolver(),
        FreezoneJobIdGenerator(),
        TaskBackendCreativeCanvasTaskScheduler(get_task_backend),
    )


@lru_cache(maxsize=1)
def creative_canvas_image_to_three_gs_use_cases() -> CreativeCanvasImageToThreeGsUseCases:
    return CreativeCanvasImageToThreeGsUseCases(
        ProjectCreativeCanvasMediaSourceResolver(),
        FreezoneJobIdGenerator(),
        TaskBackendCreativeCanvasTaskScheduler(get_task_backend),
    )


@lru_cache(maxsize=1)
def creative_canvas_image_editing_use_cases() -> CreativeCanvasImageEditingUseCases:
    return CreativeCanvasImageEditingUseCases(
        ProjectCreativeCanvasMediaSourceResolver(),
        PillowCreativeCanvasImageEditingStorage(),
        FreezoneCreativeCanvasImagePromptComposer(),
        FreezoneCreativeCanvasImageModelRouter(),
        FreezoneJobIdGenerator(),
        TaskBackendCreativeCanvasTaskScheduler(get_task_backend),
    )


@lru_cache(maxsize=1)
def creative_canvas_reference_image_editing_use_cases() -> CreativeCanvasImageEditingUseCases:
    return CreativeCanvasImageEditingUseCases(
        ProjectCreativeCanvasMediaSourceResolver(),
        PillowCreativeCanvasImageEditingStorage(),
        FreezoneCreativeCanvasImagePromptComposer(),
        FreezoneCreativeCanvasImageModelRouter(),
        FreezoneJobIdGenerator(),
        TaskBackendCreativeCanvasTaskScheduler(
            get_task_backend,
            translate_runtime_errors=False,
        ),
    )


@lru_cache(maxsize=1)
def creative_canvas_image_generation_use_cases() -> CreativeCanvasImageGenerationUseCases:
    return CreativeCanvasImageGenerationUseCases(
        ProjectCreativeCanvasMediaSourceResolver(),
        FreezoneCreativeCanvasImagePromptComposer(),
        FreezoneCreativeCanvasImageGenerationModelRouter(),
        FreezoneJobIdGenerator(),
        TaskBackendCreativeCanvasTaskScheduler(
            get_task_backend,
            translate_runtime_errors=False,
        ),
    )


@lru_cache(maxsize=1)
def creative_canvas_video_processing_use_cases() -> CreativeCanvasVideoProcessingUseCases:
    return CreativeCanvasVideoProcessingUseCases(
        ProjectCreativeCanvasMediaSourceResolver(),
        FreezoneJobIdGenerator(),
        TaskBackendCreativeCanvasTaskScheduler(
            get_task_backend,
            translate_runtime_errors=False,
        ),
    )


@lru_cache(maxsize=1)
def creative_canvas_video_model_policy() -> ConfiguredCreativeCanvasVideoModelPolicy:
    return ConfiguredCreativeCanvasVideoModelPolicy()


@lru_cache(maxsize=1)
def creative_canvas_video_asset_repository() -> (
    LocalCreativeCanvasVideoAssetRepository
):
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
        creative_canvas_video_asset_repository(),
        FreezoneJobIdGenerator(),
        TaskBackendCreativeCanvasTaskScheduler(get_task_backend),
    )
