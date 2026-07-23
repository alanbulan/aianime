"""Stable application API for the Asset & World bounded context."""

from ai_anime.modules.asset_world.application.character_voice import (
    CharacterVoiceUseCases,
    character_voice_fields,
    identity_voice_fields,
)
from ai_anime.modules.asset_world.application.dto import (
    AnalyzeStyleCommand,
    CreateCustomStyleCommand,
    StyleAnalysisBilling,
    StyleFile,
    StyleScope,
)
from ai_anime.modules.asset_world.application.errors import (
    CharacterVoiceNotFound,
    CharacterVoiceRejected,
    InvalidCharacterVoiceInput,
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
    "CharacterVoiceNotFound",
    "CharacterVoiceRejected",
    "CharacterVoiceUseCases",
    "CreateCustomStyleCommand",
    "DEFAULT_SLOT",
    "InvalidCharacterVoiceInput",
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
    "VOICE_SAMPLE_EXTENSIONS",
    "analyze_style",
    "character_voice_fields",
    "character_voice_use_cases",
    "clear_character_voice_file",
    "decode_recorded_audio_data_url",
    "is_supported_voice_sample",
    "identity_voice_fields",
    "persist_character_voice_file",
    "probe_voice_sample_duration_seconds",
    "style_catalog_use_cases",
    "style_preview_use_cases",
    "trim_existing_character_voice_file",
    "trim_voice_sample_content",
    "voice_content_sha256",
    "voice_sample_extension",
]
