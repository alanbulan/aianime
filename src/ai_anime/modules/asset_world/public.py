"""Stable application API for the Asset & World bounded context."""

from typing import Any

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
from ai_anime.modules.asset_world.application.prop_catalog import (
    PropCatalogUseCases,
)
from ai_anime.modules.asset_world.application.prop_tasks import PropTaskUseCases
from ai_anime.modules.asset_world.application.scene_catalog import (
    SceneCatalogUseCases,
)
from ai_anime.modules.asset_world.application.scene_media import SceneMediaUseCases
from ai_anime.modules.asset_world.application.scene_tasks import SceneTaskUseCases
from ai_anime.modules.asset_world.application.dto import (
    AnalyzeStyleCommand,
    CharacterGenerationOptions,
    CreateCharacterCommand,
    CreateIdentityCommand,
    CreatePropCommand,
    CreateSceneCommand,
    CreateCustomStyleCommand,
    GenerateScenePanoCommand,
    RestoreCharacterAssetCommand,
    StyleAnalysisBilling,
    StyleFile,
    StyleScope,
    UpdateCharacterCommand,
    UpdateIdentityCommand,
    UpdatePropCommand,
    UpdateSceneCommand,
)
from ai_anime.modules.asset_world.application.errors import (
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
    InvalidPropInput,
    InvalidStyleInput,
    PropAlreadyExists,
    PropCatalogRejected,
    PropNotFound,
    SceneCatalogRejected,
    StyleRejected,
    StyleStorageFailed,
    UnsupportedCharacterVoiceSlot,
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


def prop_catalog_use_cases() -> PropCatalogUseCases:
    from ai_anime.modules.asset_world.composition import prop_catalog_use_cases as build

    return build()


def scene_catalog_use_cases() -> SceneCatalogUseCases:
    from ai_anime.modules.asset_world.composition import scene_catalog_use_cases as build

    return build()


def scene_media_use_cases() -> SceneMediaUseCases:
    from ai_anime.modules.asset_world.composition import scene_media_use_cases as build

    return build()


def scene_task_use_cases() -> SceneTaskUseCases:
    from ai_anime.modules.asset_world.composition import scene_task_use_cases as build

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
    "CharacterNotFound",
    "CharacterTaskUseCases",
    "CharacterVoiceNotFound",
    "CharacterVoiceRejected",
    "CharacterVoiceUseCases",
    "CreateCharacterCommand",
    "CreateIdentityCommand",
    "CreatePropCommand",
    "CreateSceneCommand",
    "CreateCustomStyleCommand",
    "GenerateScenePanoCommand",
    "DEFAULT_SLOT",
    "InvalidCharacterVoiceInput",
    "InvalidCharacterInput",
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
    "UnsupportedStyleMedia",
    "UpdateCharacterCommand",
    "UpdateIdentityCommand",
    "UpdatePropCommand",
    "UpdateSceneCommand",
    "VOICE_SAMPLE_EXTENSIONS",
    "analyze_style",
    "character_asset_history_use_cases",
    "character_asset_links",
    "character_catalog_use_cases",
    "prop_catalog_use_cases",
    "scene_catalog_use_cases",
    "scene_media_use_cases",
    "scene_task_use_cases",
    "prop_task_use_cases",
    "character_generation_use_cases",
    "character_identity_use_cases",
    "character_image_use_cases",
    "character_task_use_cases",
    "character_voice_fields",
    "character_voice_use_cases",
    "clear_character_voice_file",
    "execute_character_image_task",
    "decode_recorded_audio_data_url",
    "is_supported_voice_sample",
    "identity_voice_fields",
    "find_character_identity",
    "newest_path_updated_at",
    "newest_updated_at",
    "path_updated_at",
    "persist_character_voice_file",
    "probe_voice_sample_duration_seconds",
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
