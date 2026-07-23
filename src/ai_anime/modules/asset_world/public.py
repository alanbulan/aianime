"""Stable application API for the Asset & World bounded context."""

from ai_anime.modules.asset_world.application.dto import (
    AnalyzeStyleCommand,
    CreateCustomStyleCommand,
    StyleAnalysisBilling,
    StyleFile,
    StyleScope,
)
from ai_anime.modules.asset_world.application.errors import (
    InvalidStyleInput,
    StyleRejected,
    StyleStorageFailed,
    UnsupportedStyleMedia,
)
from ai_anime.modules.asset_world.application.styles import (
    AnalyzeStyle,
    StyleCatalogUseCases,
    StylePreviewUseCases,
)
from ai_anime.modules.asset_world.infrastructure.style_catalog import StyleService


def style_catalog_use_cases() -> StyleCatalogUseCases:
    from ai_anime.modules.asset_world.composition import style_catalog_use_cases as build

    return build()


def style_preview_use_cases() -> StylePreviewUseCases:
    from ai_anime.modules.asset_world.composition import style_preview_use_cases as build

    return build()


def analyze_style() -> AnalyzeStyle:
    from ai_anime.modules.asset_world.composition import analyze_style as build

    return build()


__all__ = [
    "AnalyzeStyle",
    "AnalyzeStyleCommand",
    "CreateCustomStyleCommand",
    "InvalidStyleInput",
    "StyleAnalysisBilling",
    "StyleCatalogUseCases",
    "StyleFile",
    "StylePreviewUseCases",
    "StyleRejected",
    "StyleScope",
    "StyleService",
    "StyleStorageFailed",
    "UnsupportedStyleMedia",
    "analyze_style",
    "style_catalog_use_cases",
    "style_preview_use_cases",
]
