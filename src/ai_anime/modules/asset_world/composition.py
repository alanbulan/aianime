"""Runtime composition for the Asset & World bounded context."""

from ai_anime.modules.asset_world.application.character_asset_history import (
    CharacterAssetHistoryUseCases,
)
from ai_anime.modules.asset_world.application.character_catalog import (
    CharacterCatalogUseCases,
)
from ai_anime.modules.asset_world.application.character_identity import (
    CharacterIdentityUseCases,
)
from ai_anime.modules.asset_world.application.character_voice import (
    CharacterVoiceUseCases,
)
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
from ai_anime.modules.asset_world.infrastructure.style_catalog import StyleService
from ai_anime.modules.asset_world.infrastructure.style_generation import (
    PydanticStyleImageAnalyzer,
    UnifiedStylePreviewGenerator,
)


def style_catalog_use_cases() -> StyleCatalogUseCases:
    return StyleCatalogUseCases(StyleService)


def character_asset_history_use_cases() -> CharacterAssetHistoryUseCases:
    return CharacterAssetHistoryUseCases(LocalCharacterAssetHistoryFiles())


def character_catalog_use_cases() -> CharacterCatalogUseCases:
    return CharacterCatalogUseCases(
        NovelCharacterFactory(),
        LocalCharacterCatalogAssets(),
    )


def character_identity_use_cases() -> CharacterIdentityUseCases:
    return CharacterIdentityUseCases(
        PydanticCharacterIdentityFactory(),
        LocalCharacterIdentityAssets(),
    )


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
