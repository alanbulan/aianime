"""Stable application API for the Asset & World bounded context."""

from ai_anime.modules.asset_world.application.character_catalog import (
    CharacterCatalogUseCases,
    character_asset_links,
)
from ai_anime.modules.asset_world.application.character_identity import (
    CharacterIdentityUseCases,
)
from ai_anime.modules.asset_world.application.character_voice import (
    CharacterVoiceUseCases,
    character_voice_fields,
    identity_voice_fields,
)
from ai_anime.modules.asset_world.application.dto import (
    AnalyzeStyleCommand,
    CreateCharacterCommand,
    CreateIdentityCommand,
    CreateCustomStyleCommand,
    StyleAnalysisBilling,
    StyleFile,
    StyleScope,
    UpdateCharacterCommand,
    UpdateIdentityCommand,
)
from ai_anime.modules.asset_world.application.errors import (
    CharacterAlreadyExists,
    CharacterCatalogRejected,
    CharacterNotFound,
    CharacterVoiceNotFound,
    CharacterVoiceRejected,
    InvalidCharacterVoiceInput,
    InvalidCharacterInput,
    InvalidStyleInput,
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


def style_catalog_use_cases() -> StyleCatalogUseCases:
    from ai_anime.modules.asset_world.composition import style_catalog_use_cases as build

    return build()


def character_catalog_use_cases() -> CharacterCatalogUseCases:
    from ai_anime.modules.asset_world.composition import character_catalog_use_cases as build

    return build()


def character_identity_use_cases() -> CharacterIdentityUseCases:
    from ai_anime.modules.asset_world.composition import character_identity_use_cases as build

    return build()


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
    "CharacterCatalogRejected",
    "CharacterCatalogUseCases",
    "CharacterIdentityUseCases",
    "CharacterNotFound",
    "CharacterVoiceNotFound",
    "CharacterVoiceRejected",
    "CharacterVoiceUseCases",
    "CreateCharacterCommand",
    "CreateIdentityCommand",
    "CreateCustomStyleCommand",
    "DEFAULT_SLOT",
    "InvalidCharacterVoiceInput",
    "InvalidCharacterInput",
    "InvalidStyleInput",
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
    "VOICE_SAMPLE_EXTENSIONS",
    "analyze_style",
    "character_asset_links",
    "character_catalog_use_cases",
    "character_identity_use_cases",
    "character_voice_fields",
    "character_voice_use_cases",
    "clear_character_voice_file",
    "decode_recorded_audio_data_url",
    "is_supported_voice_sample",
    "identity_voice_fields",
    "newest_path_updated_at",
    "newest_updated_at",
    "path_updated_at",
    "persist_character_voice_file",
    "probe_voice_sample_duration_seconds",
    "style_catalog_use_cases",
    "style_preview_use_cases",
    "tree_updated_at",
    "trim_existing_character_voice_file",
    "trim_voice_sample_content",
    "voice_content_sha256",
    "voice_sample_extension",
    "utc_iso",
]
