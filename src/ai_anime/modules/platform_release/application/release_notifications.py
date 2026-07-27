"""Release notification queries."""

from __future__ import annotations

from ai_anime.modules.platform_release.domain import normalize_release_locale
from ai_anime.ports.release_feed import ReleaseFeed, ReleaseFeedPort


class ReleaseNotificationQueries:
    def __init__(self, release_feed: ReleaseFeedPort) -> None:
        self._release_feed = release_feed

    async def current(self, *, locale_hint: str | None) -> ReleaseFeed:
        return await self._release_feed.current(
            locale=normalize_release_locale(locale_hint),
        )
