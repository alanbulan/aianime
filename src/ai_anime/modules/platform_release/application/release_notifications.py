"""Release notification queries."""

from __future__ import annotations

from ai_anime.modules.platform_release.application.ports import ReleaseFeedPort
from ai_anime.modules.platform_release.domain import (
    ReleaseFeed,
    normalize_release_locale,
)


class ReleaseNotificationQueries:
    def __init__(self, release_feed: ReleaseFeedPort) -> None:
        self._release_feed = release_feed

    async def current(self, *, locale_hint: str | None) -> ReleaseFeed:
        return await self._release_feed.current(
            locale=normalize_release_locale(locale_hint),
        )
