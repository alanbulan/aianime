"""Platform release outbound ports."""

from __future__ import annotations

from typing import Protocol

from ai_anime.modules.platform_release.domain import ReleaseFeed, ReleaseLocale


class ReleaseFeedPort(Protocol):
    async def current(self, *, locale: ReleaseLocale) -> ReleaseFeed: ...
