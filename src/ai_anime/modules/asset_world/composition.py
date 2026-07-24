"""Runtime composition for the Asset & World bounded context."""

from pathlib import Path
from typing import Any

from ai_anime.modules.asset_world.application.background_anchor import (
    BeatBackgroundAnchorUseCases,
)
from ai_anime.modules.asset_world.application.beat_viewer import BeatViewerUseCases
from ai_anime.modules.asset_world.application.character_asset_history import (
    CharacterAssetHistoryUseCases,
)
from ai_anime.modules.asset_world.application.character_catalog import (
    CharacterCatalogUseCases,
)
from ai_anime.modules.asset_world.application.character_identity import (
    CharacterIdentityUseCases,
)
from ai_anime.modules.asset_world.application.character_reference import (
    CharacterReferenceUseCases,
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
from ai_anime.modules.asset_world.application.director_stage import (
    BeatDirectorStageUseCases,
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
from ai_anime.modules.asset_world.infrastructure.background_anchor import (
    LocalBeatBackgroundAnchorFiles,
)
from ai_anime.modules.asset_world.infrastructure.beat_viewer import (
    AssetWorldBeatViewerRuntimePropMenuSource,
    CompatibleBeatViewerEpisodeSource,
    ProjectBeatViewerMediaUrls,
    SqliteBeatViewerWorkspace,
)
from ai_anime.modules.asset_world.infrastructure.director_stage import (
    LocalBeatDirectorStageFiles,
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
from ai_anime.modules.asset_world.infrastructure.character_reference import (
    LocalCharacterReferenceAssets,
    PromptCharacterReferenceSource,
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
    LocalCachedPropRepository,
    LocalPropCatalogAssets,
    LocalPropPromotionRepository,
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


def character_reference_use_cases() -> CharacterReferenceUseCases:
    return CharacterReferenceUseCases(
        PromptCharacterReferenceSource(),
        LocalCharacterReferenceAssets(),
    )


def build_character_map_for_grid(
    grid_beats: list[dict[str, Any]],
    characters: list[dict[str, Any]],
    user_output_dir: Path,
    project: str,
    *,
    sketch_colors: dict[str, str] | None = None,
    use_detected_identities: bool = False,
) -> dict[str, dict[str, Any]]:
    return character_reference_use_cases().build_grid_character_map(
        beats=grid_beats,
        characters=characters,
        project_dir=user_output_dir / project,
        sketch_colors=sketch_colors,
        use_detected_identities=use_detected_identities,
    )


def prop_catalog_use_cases() -> PropCatalogUseCases:
    return PropCatalogUseCases(
        NovelPropFactory(),
        LocalPropCatalogAssets(),
        NovelEpisodeLocalPropSource(),
    )


async def promote_episode_props_to_global(
    store: Any,
    prop_menu: list[Any],
) -> list[str]:
    return await prop_catalog_use_cases().promote_episode_props(
        repository=LocalPropPromotionRepository(store),
        prop_menu=prop_menu,
    )


def runtime_prop_menu_with_cached_global_props(
    *,
    prop_menu: list[dict[str, Any]],
    beats: list[dict[str, Any]],
    store: Any,
) -> list[dict[str, Any]]:
    return prop_catalog_use_cases().runtime_prop_menu(
        repository=LocalCachedPropRepository(store),
        prop_menu=prop_menu,
        beats=beats,
    )


def runtime_prop_menu_for_episode(
    store: Any,
    episode: Any,
    beats: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    return prop_catalog_use_cases().runtime_episode_prop_menu(
        repository=LocalCachedPropRepository(store),
        episode=episode,
        beats=beats,
    )


def scene_catalog_use_cases() -> SceneCatalogUseCases:
    return SceneCatalogUseCases(NovelSceneFactory(), LocalSceneCatalogAssets())


def scene_media_use_cases() -> SceneMediaUseCases:
    return SceneMediaUseCases(LocalSceneMediaFiles())


def scene_viewer_use_cases() -> SceneViewerUseCases:
    from ai_anime.modules.production.public import (
        BRIDGMAN_CHARACTER_PALETTE,
        PROP_MARKER_PALETTE,
    )

    return SceneViewerUseCases(
        LocalSceneViewerAssets(),
        anonymous_actor_colors=[color for color, _label in BRIDGMAN_CHARACTER_PALETTE],
        anonymous_prop_colors=[color for color, _label in PROP_MARKER_PALETTE],
    )


def beat_viewer_use_cases() -> BeatViewerUseCases:
    return BeatViewerUseCases(
        SqliteBeatViewerWorkspace(),
        ProjectBeatViewerMediaUrls(),
        scene_viewer_use_cases(),
        BeatDirectorStageUseCases(LocalBeatDirectorStageFiles()),
        CompatibleBeatViewerEpisodeSource(),
        AssetWorldBeatViewerRuntimePropMenuSource(prop_catalog_use_cases()),
    )


def beat_background_anchor_use_cases() -> BeatBackgroundAnchorUseCases:
    return BeatBackgroundAnchorUseCases(LocalBeatBackgroundAnchorFiles())


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
