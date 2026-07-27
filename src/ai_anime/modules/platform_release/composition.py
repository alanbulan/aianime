"""Platform release composition root."""

from ai_anime.modules.platform_release.application import ReleaseNotificationQueries
from ai_anime.ports import get_release_feed_port


def release_notification_queries() -> ReleaseNotificationQueries:
    return ReleaseNotificationQueries(get_release_feed_port())
