"""Platform release domain rules."""

from ai_anime.modules.platform_release.domain.release_notifications import (
    ReleaseLocale,
    normalize_release_locale,
)
from ai_anime.modules.platform_release.domain.runtime_config import (
    RuntimeConfig,
    RuntimeEdition,
    build_runtime_config,
)

__all__ = [
    "ReleaseLocale",
    "RuntimeConfig",
    "RuntimeEdition",
    "build_runtime_config",
    "normalize_release_locale",
]
