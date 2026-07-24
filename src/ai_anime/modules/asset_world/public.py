"""Stable application API for the Asset & World bounded context."""

from pathlib import Path
from typing import Any

from ai_anime.modules.asset_world.application.background_anchor import (
    BeatBackgroundAnchorUseCases,
)
from ai_anime.modules.asset_world.application.beat_viewer import (
    BeatViewerBeatNotFound,
    BeatViewerQuery,
    BeatViewerUseCases,
)
from ai_anime.modules.asset_world.application.character_asset_history import (
    CharacterAssetHistoryUseCases,
)
from ai_anime.modules.asset_world.application.character_catalog import (
    CharacterCatalogUseCases,
    character_asset_links,
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
    character_voice_fields,
    identity_voice_fields,
)
from ai_anime.modules.asset_world.application.director_stage import (
    BeatDirectorStageUseCases,
    resolve_beat_scene_name,
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
from ai_anime.modules.asset_world.application.dto import (
    AnalyzeStyleCommand,
    CharacterGenerationOptions,
    CropBeatBackgroundCommand,
    CreateCharacterCommand,
    CreateIdentityCommand,
    CreatePropCommand,
    CreateSceneCommand,
    CreateCustomStyleCommand,
    ExportBeatDirectorControlFrameCommand,
    GenerateScenePanoCommand,
    RestoreCharacterAssetCommand,
    SaveSceneDirectorWorldCommand,
    SaveSceneDirectorWorldSourceCommand,
    SaveBeatDirectorOverlayCommand,
    SelectBeatBackgroundCommand,
    StyleAnalysisBilling,
    StyleFile,
    StyleScope,
    UpdateCharacterCommand,
    UpdateIdentityCommand,
    UpdatePropCommand,
    UpdateSceneCommand,
    UploadBeatBackgroundCommand,
)
from ai_anime.modules.asset_world.application.errors import (
    BackgroundAnchorRejected,
    CharacterAlreadyExists,
    CharacterAssetHistoryNotFound,
    CharacterAssetHistoryRejected,
    CharacterCatalogRejected,
    CharacterIdentityNotFound,
    CharacterNotFound,
    CharacterVoiceNotFound,
    CharacterVoiceRejected,
    InvalidCharacterVoiceInput,
    InvalidCharacterInput,
    InvalidImageSelection,
    InvalidPropInput,
    InvalidStyleInput,
    PropAlreadyExists,
    PropCatalogRejected,
    PropNotFound,
    SceneCatalogRejected,
    SceneViewerRejected,
    StyleRejected,
    StyleStorageFailed,
    UnsupportedCharacterVoiceSlot,
    UnsupportedImageSourceKind,
    UnsupportedStyleMedia,
)
from ai_anime.modules.asset_world.application.styles import (
    AnalyzeStyle,
    StyleCatalogUseCases,
    StylePreviewUseCases,
)
from ai_anime.modules.asset_world.domain.character_voice import (
    AGE_GROUP_SLOTS,
    ALL_SLOTS,
    DEFAULT_SLOT,
)
from ai_anime.modules.asset_world.domain.character_assets import (
    find_character_identity,
    safe_character_asset_name,
)
from ai_anime.modules.asset_world.domain.director_stage import director_control_scope
from ai_anime.modules.asset_world.infrastructure.asset_metadata import (
    newest_path_updated_at,
    newest_updated_at,
    path_updated_at,
    tree_updated_at,
    utc_iso,
)
from ai_anime.modules.asset_world.infrastructure.character_voice_storage import (
    VOICE_SAMPLE_EXTENSIONS,
    clear_character_voice_file,
    decode_recorded_audio_data_url,
    is_supported_voice_sample,
    persist_character_voice_file,
    probe_voice_sample_duration_seconds,
    trim_existing_character_voice_file,
    trim_voice_sample_content,
    voice_content_sha256,
    voice_sample_extension,
)
from ai_anime.modules.asset_world.infrastructure.style_catalog import StyleService
from ai_anime.modules.project_workspace.public import ProjectContext


def style_catalog_use_cases() -> StyleCatalogUseCases:
    from ai_anime.modules.asset_world.composition import style_catalog_use_cases as build

    return build()


def character_asset_history_use_cases() -> CharacterAssetHistoryUseCases:
    from ai_anime.modules.asset_world.composition import (
        character_asset_history_use_cases as build,
    )

    return build()


def character_catalog_use_cases() -> CharacterCatalogUseCases:
    from ai_anime.modules.asset_world.composition import character_catalog_use_cases as build

    return build()


def character_reference_use_cases() -> CharacterReferenceUseCases:
    from ai_anime.modules.asset_world.composition import (
        character_reference_use_cases as build,
    )

    return build()


def build_character_map_for_grid(
    grid_beats: list[dict[str, Any]],
    characters: list[dict[str, Any]],
    user_output_dir: Path,
    project: str,
    *,
    sketch_colors: dict[str, str] | None = None,
    use_detected_identities: bool = False,
) -> dict[str, dict[str, Any]]:
    from ai_anime.modules.asset_world.composition import (
        build_character_map_for_grid as build,
    )

    return build(
        grid_beats,
        characters,
        user_output_dir,
        project,
        sketch_colors=sketch_colors,
        use_detected_identities=use_detected_identities,
    )


def prop_catalog_use_cases() -> PropCatalogUseCases:
    from ai_anime.modules.asset_world.composition import prop_catalog_use_cases as build

    return build()


async def promote_episode_props_to_global(
    store: Any,
    prop_menu: list[Any],
) -> list[str]:
    from ai_anime.modules.asset_world.composition import (
        promote_episode_props_to_global as execute,
    )

    return await execute(store, prop_menu)


def runtime_prop_menu_with_cached_global_props(
    *,
    prop_menu: list[dict[str, Any]],
    beats: list[dict[str, Any]],
    store: Any,
) -> list[dict[str, Any]]:
    from ai_anime.modules.asset_world.composition import (
        runtime_prop_menu_with_cached_global_props as build,
    )

    return build(prop_menu=prop_menu, beats=beats, store=store)


async def runtime_prop_menu_for_episode(
    store: Any,
    episode: Any,
    beats: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    from ai_anime.modules.asset_world.composition import (
        runtime_prop_menu_for_episode as build,
    )

    return build(store, episode, beats)


def scene_catalog_use_cases() -> SceneCatalogUseCases:
    from ai_anime.modules.asset_world.composition import scene_catalog_use_cases as build

    return build()


def scene_media_use_cases() -> SceneMediaUseCases:
    from ai_anime.modules.asset_world.composition import scene_media_use_cases as build

    return build()


def scene_task_use_cases() -> SceneTaskUseCases:
    from ai_anime.modules.asset_world.composition import scene_task_use_cases as build

    return build()


def scene_viewer_use_cases() -> SceneViewerUseCases:
    from ai_anime.modules.asset_world.composition import scene_viewer_use_cases as build

    return build()


def beat_viewer_use_cases() -> BeatViewerUseCases:
    from ai_anime.modules.asset_world.composition import beat_viewer_use_cases as build

    return build()


def beat_director_stage_use_cases() -> BeatDirectorStageUseCases:
    from ai_anime.modules.asset_world.composition import (
        beat_director_stage_use_cases as build,
    )

    return build()


def beat_background_anchor_use_cases() -> BeatBackgroundAnchorUseCases:
    from ai_anime.modules.asset_world.composition import (
        beat_background_anchor_use_cases as build,
    )

    return build()


def prop_task_use_cases() -> PropTaskUseCases:
    from ai_anime.modules.asset_world.composition import prop_task_use_cases as build

    return build()


def character_identity_use_cases() -> CharacterIdentityUseCases:
    from ai_anime.modules.asset_world.composition import character_identity_use_cases as build

    return build()


def character_generation_use_cases() -> CharacterGenerationUseCases:
    from ai_anime.modules.asset_world.composition import (
        character_generation_use_cases as build,
    )

    return build()


def character_image_use_cases() -> CharacterImageUseCases:
    from ai_anime.modules.asset_world.composition import character_image_use_cases as build

    return build()


def image_settings_use_cases() -> ImageSettingsUseCases:
    from ai_anime.modules.asset_world.composition import (
        image_settings_use_cases as build,
    )

    return build()


def character_task_use_cases() -> CharacterTaskUseCases:
    from ai_anime.modules.asset_world.composition import character_task_use_cases as build

    return build()


async def execute_character_image_task(
    envelope: dict[str, Any],
    context: ProjectContext,
) -> dict[str, Any] | None:
    from ai_anime.modules.asset_world.composition import (
        execute_character_image_task as execute,
    )

    return await execute(envelope, context)


def character_voice_use_cases() -> CharacterVoiceUseCases:
    from ai_anime.modules.asset_world.composition import character_voice_use_cases as build

    return build()


def style_preview_use_cases() -> StylePreviewUseCases:
    from ai_anime.modules.asset_world.composition import style_preview_use_cases as build

    return build()


def analyze_style() -> AnalyzeStyle:
    from ai_anime.modules.asset_world.composition import analyze_style as build

    return build()


__all__ = [
    "AGE_GROUP_SLOTS",
    "ALL_SLOTS",
    "AnalyzeStyle",
    "AnalyzeStyleCommand",
    "BackgroundAnchorRejected",
    "BeatBackgroundAnchorUseCases",
    "BeatViewerBeatNotFound",
    "BeatViewerQuery",
    "BeatViewerUseCases",
    "CharacterAlreadyExists",
    "CharacterAssetHistoryNotFound",
    "CharacterAssetHistoryRejected",
    "CharacterAssetHistoryUseCases",
    "CharacterCatalogRejected",
    "CharacterCatalogUseCases",
    "CharacterGenerationOptions",
    "CharacterGenerationUseCases",
    "CharacterIdentityNotFound",
    "CharacterIdentityUseCases",
    "CharacterImageUseCases",
    "ImageSettingsUseCases",
    "CharacterNotFound",
    "CharacterReferenceUseCases",
    "CharacterTaskUseCases",
    "CharacterVoiceNotFound",
    "CharacterVoiceRejected",
    "CharacterVoiceUseCases",
    "BeatDirectorStageUseCases",
    "CreateCharacterCommand",
    "CreateIdentityCommand",
    "CreatePropCommand",
    "CreateSceneCommand",
    "CreateCustomStyleCommand",
    "CropBeatBackgroundCommand",
    "ExportBeatDirectorControlFrameCommand",
    "GenerateScenePanoCommand",
    "DEFAULT_SLOT",
    "InvalidCharacterVoiceInput",
    "InvalidCharacterInput",
    "InvalidImageSelection",
    "InvalidPropInput",
    "InvalidStyleInput",
    "PropAlreadyExists",
    "PropCatalogRejected",
    "PropCatalogUseCases",
    "PropNotFound",
    "PropTaskUseCases",
    "SceneCatalogRejected",
    "SceneCatalogUseCases",
    "SceneMediaUseCases",
    "SceneTaskUseCases",
    "SceneViewerRejected",
    "SceneViewerUseCases",
    "SaveSceneDirectorWorldCommand",
    "SaveSceneDirectorWorldSourceCommand",
    "SaveBeatDirectorOverlayCommand",
    "SelectBeatBackgroundCommand",
    "RestoreCharacterAssetCommand",
    "StyleAnalysisBilling",
    "StyleCatalogUseCases",
    "StyleFile",
    "StylePreviewUseCases",
    "StyleRejected",
    "StyleScope",
    "StyleService",
    "StyleStorageFailed",
    "UnsupportedCharacterVoiceSlot",
    "UnsupportedImageSourceKind",
    "UnsupportedStyleMedia",
    "UpdateCharacterCommand",
    "UpdateIdentityCommand",
    "UpdatePropCommand",
    "UpdateSceneCommand",
    "UploadBeatBackgroundCommand",
    "VOICE_SAMPLE_EXTENSIONS",
    "analyze_style",
    "beat_background_anchor_use_cases",
    "beat_director_stage_use_cases",
    "beat_viewer_use_cases",
    "build_character_map_for_grid",
    "character_asset_history_use_cases",
    "character_asset_links",
    "character_catalog_use_cases",
    "character_reference_use_cases",
    "prop_catalog_use_cases",
    "promote_episode_props_to_global",
    "runtime_prop_menu_for_episode",
    "runtime_prop_menu_with_cached_global_props",
    "scene_catalog_use_cases",
    "scene_media_use_cases",
    "scene_task_use_cases",
    "scene_viewer_use_cases",
    "prop_task_use_cases",
    "character_generation_use_cases",
    "character_identity_use_cases",
    "character_image_use_cases",
    "image_settings_use_cases",
    "character_task_use_cases",
    "character_voice_fields",
    "character_voice_use_cases",
    "clear_character_voice_file",
    "execute_character_image_task",
    "decode_recorded_audio_data_url",
    "director_control_scope",
    "is_supported_voice_sample",
    "identity_voice_fields",
    "find_character_identity",
    "newest_path_updated_at",
    "newest_updated_at",
    "path_updated_at",
    "persist_character_voice_file",
    "probe_voice_sample_duration_seconds",
    "resolve_beat_scene_name",
    "safe_character_asset_name",
    "style_catalog_use_cases",
    "style_preview_use_cases",
    "tree_updated_at",
    "trim_existing_character_voice_file",
    "trim_voice_sample_content",
    "voice_content_sha256",
    "voice_sample_extension",
    "utc_iso",
]
