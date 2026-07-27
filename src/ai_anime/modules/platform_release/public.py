"""Stable application API exposed by Platform Release."""

from ai_anime.modules.platform_release.application import ReleaseNotificationQueries
from ai_anime.modules.platform_release.domain import (
    ReleaseLocale,
    normalize_release_locale,
)


def release_notification_queries() -> ReleaseNotificationQueries:
    from ai_anime.modules.platform_release.composition import (
        release_notification_queries as build,
    )

    return build()


__all__ = [
    "ReleaseLocale",
    "ReleaseNotificationQueries",
    "normalize_release_locale",
    "release_notification_queries",
]
