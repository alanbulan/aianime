"""Stable application API exposed by Platform Release."""

from ai_anime.modules.platform_release.application import (
    ReleaseNotificationQueries,
    RuntimeConfigQueries,
)
from ai_anime.modules.platform_release.domain import (
    ReleaseLocale,
    RuntimeConfig,
    RuntimeEdition,
    normalize_release_locale,
)


def release_notification_queries() -> ReleaseNotificationQueries:
    from ai_anime.modules.platform_release.composition import (
        release_notification_queries as build,
    )

    return build()


def runtime_config_queries() -> RuntimeConfigQueries:
    from ai_anime.modules.platform_release.composition import (
        runtime_config_queries as build,
    )

    return build()


__all__ = [
    "ReleaseLocale",
    "ReleaseNotificationQueries",
    "RuntimeConfig",
    "RuntimeConfigQueries",
    "RuntimeEdition",
    "normalize_release_locale",
    "release_notification_queries",
    "runtime_config_queries",
]
