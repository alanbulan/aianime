"""Runtime composition for the Asset & World bounded context."""

from typing import Any

from ai_anime.modules.asset_world.application.character_asset_history import (
    CharacterAssetHistoryUseCases,
)
from ai_anime.modules.asset_world.application.character_catalog import (
    CharacterCatalogUseCases,
)
from ai_anime.modules.asset_world.application.character_identity import (
    CharacterIdentityUseCases,
)
from ai_anime.modules.asset_world.application.character_generation import (
    CharacterGenerationUseCases,
)
from ai_anime.modules.asset_world.application.character_images import (
    CharacterImageUseCases,
)
from ai_anime.modules.asset_world.application.character_tasks import (
    CharacterTaskUseCases,
)
from ai_anime.modules.asset_world.application.character_voice import (
    CharacterVoiceUseCases,
)
from ai_anime.modules.asset_world.application.image_settings import (
    ImageSettingsUseCases,
)
from ai_anime.modules.asset_world.application.prop_catalog import (
    PropCatalogUseCases,
)
from ai_anime.modules.asset_world.application.prop_tasks import PropTaskUseCases
from ai_anime.modules.asset_world.application.scene_catalog import (
    SceneCatalogUseCases,
)
from ai_anime.modules.asset_world.application.scene_media import SceneMediaUseCases
from ai_anime.modules.asset_world.application.scene_tasks import SceneTaskUseCases
from ai_anime.modules.asset_world.application.scene_viewer import SceneViewerUseCases
from ai_anime.modules.asset_world.application.styles import (
    AnalyzeStyle,
    StyleCatalogUseCases,
    StylePreviewUseCases,
)
from ai_anime.modules.asset_world.infrastructure.character_voice_storage import (
    LocalCharacterVoiceFiles,
)
from ai_anime.modules.asset_world.infrastructure.character_catalog import (
    LocalCharacterCatalogAssets,
    NovelCharacterFactory,
)
from ai_anime.modules.asset_world.infrastructure.character_asset_history import (
    LocalCharacterAssetHistoryFiles,
)
from ai_anime.modules.asset_world.infrastructure.character_identity import (
    LocalCharacterIdentityAssets,
    PydanticCharacterIdentityFactory,
)
from ai_anime.modules.asset_world.infrastructure.character_generation import (
    UnifiedSynchronousCharacterGeneration,
)
from ai_anime.modules.asset_world.infrastructure.character_image_storage import (
    LocalCharacterImageFiles,
)
from ai_anime.modules.asset_world.infrastructure.image_settings import (
    ConfiguredImageSelectionCatalog,
    ProjectConfigImageGenerationSettings,
    ProjectConfigImageSelectionStore,
    SqliteImageUsageReader,
)
from ai_anime.modules.asset_world.infrastructure.prop_catalog import (
    LocalPropCatalogAssets,
    NovelEpisodeLocalPropSource,
    NovelPropFactory,
)
from ai_anime.modules.asset_world.infrastructure.scene_catalog import (
    LocalSceneCatalogAssets,
    NovelSceneFactory,
)
from ai_anime.modules.asset_world.infrastructure.scene_task_assets import (
    LocalSceneTaskAssets,
)
from ai_anime.modules.asset_world.infrastructure.scene_media import LocalSceneMediaFiles
from ai_anime.modules.asset_world.infrastructure.scene_viewer import LocalSceneViewerAssets
from ai_anime.modules.asset_world.infrastructure.style_catalog import StyleService
from ai_anime.modules.asset_world.infrastructure.style_generation import (
    PydanticStyleImageAnalyzer,
    UnifiedStylePreviewGenerator,
)
from ai_anime.modules.asset_world.infrastructure.task_scheduler import (
    TaskBackendAssetTaskScheduler,
)
from ai_anime.modules.project_workspace.public import ProjectContext


def style_catalog_use_cases() -> StyleCatalogUseCases:
    return StyleCatalogUseCases(StyleService)


def character_asset_history_use_cases() -> CharacterAssetHistoryUseCases:
    return CharacterAssetHistoryUseCases(LocalCharacterAssetHistoryFiles())


def character_catalog_use_cases() -> CharacterCatalogUseCases:
    return CharacterCatalogUseCases(
        NovelCharacterFactory(),
        LocalCharacterCatalogAssets(),
    )


def prop_catalog_use_cases() -> PropCatalogUseCases:
    return PropCatalogUseCases(
        NovelPropFactory(),
        LocalPropCatalogAssets(),
        NovelEpisodeLocalPropSource(),
    )


def scene_catalog_use_cases() -> SceneCatalogUseCases:
    return SceneCatalogUseCases(NovelSceneFactory(), LocalSceneCatalogAssets())


def scene_media_use_cases() -> SceneMediaUseCases:
    return SceneMediaUseCases(LocalSceneMediaFiles())


def scene_viewer_use_cases() -> SceneViewerUseCases:
    from ai_anime.generators.episode_optimizer import (
        BRIDGMAN_CHARACTER_PALETTE,
        PROP_MARKER_PALETTE,
    )

    return SceneViewerUseCases(
        LocalSceneViewerAssets(),
        anonymous_actor_colors=[color for color, _label in BRIDGMAN_CHARACTER_PALETTE],
        anonymous_prop_colors=[color for color, _label in PROP_MARKER_PALETTE],
    )


def scene_task_use_cases() -> SceneTaskUseCases:
    from ai_anime import ports

    return SceneTaskUseCases(
        TaskBackendAssetTaskScheduler(ports.get_task_backend),
        LocalSceneTaskAssets(),
    )


def character_identity_use_cases() -> CharacterIdentityUseCases:
    return CharacterIdentityUseCases(
        PydanticCharacterIdentityFactory(),
        LocalCharacterIdentityAssets(),
    )


def character_generation_use_cases() -> CharacterGenerationUseCases:
    return CharacterGenerationUseCases(UnifiedSynchronousCharacterGeneration())


def character_image_use_cases() -> CharacterImageUseCases:
    return CharacterImageUseCases(LocalCharacterImageFiles())


def image_settings_use_cases() -> ImageSettingsUseCases:
    return ImageSettingsUseCases(
        ConfiguredImageSelectionCatalog(),
        ProjectConfigImageSelectionStore(),
        ProjectConfigImageGenerationSettings(),
        SqliteImageUsageReader(),
    )


def character_task_use_cases() -> CharacterTaskUseCases:
    from ai_anime import ports

    return CharacterTaskUseCases(TaskBackendAssetTaskScheduler(ports.get_task_backend))


def prop_task_use_cases() -> PropTaskUseCases:
    from ai_anime import ports

    return PropTaskUseCases(TaskBackendAssetTaskScheduler(ports.get_task_backend))


async def execute_character_image_task(
    envelope: dict[str, Any],
    context: ProjectContext,
) -> dict[str, Any] | None:
    from ai_anime.modules.asset_world.infrastructure.character_image_task_runtime import (
        execute_character_image_task as execute,
    )

    return await execute(envelope, context)


def character_voice_use_cases() -> CharacterVoiceUseCases:
    return CharacterVoiceUseCases(LocalCharacterVoiceFiles())


def style_preview_use_cases() -> StylePreviewUseCases:
    return StylePreviewUseCases(StyleService, UnifiedStylePreviewGenerator())


def analyze_style() -> AnalyzeStyle:
    from ai_anime.ports import get_usage_meter

    return AnalyzeStyle(
        StyleService,
        PydanticStyleImageAnalyzer(),
        get_usage_meter(),
    )
