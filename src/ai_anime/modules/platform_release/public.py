"""Stable application API exposed by Platform Release."""

from ai_anime.modules.platform_release.application import (
    ProjectFileDelivery,
    ProjectFileQueries,
    RuntimeConfigQueries,
)
from ai_anime.modules.platform_release.domain import (
    ProjectDirectoryNotFound,
    ProjectFileAccessDenied,
    ProjectFileError,
    ProjectFileNotFound,
    RuntimeConfig,
    RuntimeEdition,
)


def project_file_queries() -> ProjectFileQueries:
    from ai_anime.modules.platform_release.composition import (
        project_file_queries as build,
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
    "RuntimeConfig",
    "RuntimeConfigQueries",
    "RuntimeEdition",
    "project_file_queries",
    "runtime_config_queries",
]
