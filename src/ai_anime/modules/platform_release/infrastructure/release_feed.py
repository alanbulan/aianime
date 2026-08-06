"""Empty release feed used until a real release service is connected."""

from __future__ import annotations

from ai_anime.modules.platform_release.domain import (
    ReleaseFeed,
    ReleaseLocale,
)


class NoOpReleaseFeed:
    async def current(self, *, locale: ReleaseLocale) -> ReleaseFeed:
        _ = locale
        return ReleaseFeed(source="none")