"""Platform release composition root."""

from ai_anime.modules.platform_release.application import (
    ProjectFileQueries,
    ReleaseFeedPort,
    ReleaseNotificationQueries,
    RuntimeConfigQueries,
)
from ai_anime.modules.platform_release.infrastructure import (
    LocalProjectFileGateway,
    ProcessRuntimeConfigEnvironment,
)
from ai_anime.shared.ports.registry import get_port

_runtime_config_environment = ProcessRuntimeConfigEnvironment()
_project_file_gateway = LocalProjectFileGateway()


def project_file_queries() -> ProjectFileQueries:
    return ProjectFileQueries(_project_file_gateway)


def release_notification_queries() -> ReleaseNotificationQueries:
    release_feed: ReleaseFeedPort = get_port("release_feed")
    return ReleaseNotificationQueries(release_feed)


def runtime_config_queries() -> RuntimeConfigQueries:
    return RuntimeConfigQueries(_runtime_config_environment)
