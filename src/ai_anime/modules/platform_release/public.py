"""Stable application API exposed by Platform Release."""

from ai_anime.modules.platform_release.application import (
    ProjectFileDelivery,
    ProjectFileQueries,
    ReleaseFeedPort,
    ReleaseNotificationQueries,
    RuntimeConfigQueries,
)
from ai_anime.modules.platform_release.domain import (
    ProjectDirectoryNotFound,
    ProjectFileAccessDenied,
    ProjectFileError,
    ProjectFileNotFound,
    ReleaseFeed,
    ReleaseItem,
    ReleaseLocale,
    RuntimeConfig,
    RuntimeEdition,
    normalize_release_locale,
)


def build_local_release_feed(adapter_name: str) -> ReleaseFeedPort:
    from ai_anime.modules.platform_release.infrastructure import (
        NoOpReleaseFeed,
    )

    _ = adapter_name
    return NoOpReleaseFeed()


def project_file_queries() -> ProjectFileQueries:
    from ai_anime.modules.platform_release.composition import (
        project_file_queries as build,
    )

    return build()


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
    "ProjectDirectoryNotFound",
    "ProjectFileAccessDenied",
    "ProjectFileDelivery",
    "ProjectFileError",
    "ProjectFileNotFound",
    "ProjectFileQueries",
    "ReleaseFeed",
    "ReleaseFeedPort",
    "ReleaseItem",
    "ReleaseLocale",
    "ReleaseNotificationQueries",
    "RuntimeConfig",
    "RuntimeConfigQueries",
    "RuntimeEdition",
    "build_local_release_feed",
    "normalize_release_locale",
    "project_file_queries",
    "release_notification_queries",
    "runtime_config_queries",
]
