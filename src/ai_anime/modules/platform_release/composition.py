"""Platform release composition root."""

from ai_anime.modules.platform_release.application import (
    ReleaseNotificationQueries,
    RuntimeConfigQueries,
)
from ai_anime.modules.platform_release.infrastructure import (
    ProcessRuntimeConfigEnvironment,
)
from ai_anime.ports import get_release_feed_port

_runtime_config_environment = ProcessRuntimeConfigEnvironment()


def release_notification_queries() -> ReleaseNotificationQueries:
    return ReleaseNotificationQueries(get_release_feed_port())


def runtime_config_queries() -> RuntimeConfigQueries:
    return RuntimeConfigQueries(_runtime_config_environment)
