from __future__ import annotations

from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import ai_anime.shared.ports.registry as port_registry
from ai_anime.api.auth import get_api_user
from ai_anime.api.routes import release_notifications
from ai_anime.modules.platform_release.domain import (
    parse_release_notes,
    validate_version_marker,
)
from ai_anime.modules.platform_release.infrastructure import (
    NoOpReleaseFeed,
)
from ai_anime.modules.platform_release.public import (
    ReleaseFeed,
    ReleaseNotificationQueries,
    normalize_release_locale,
)


def test_release_notes_parse_localized_highlights() -> None:
    body = """\
---
version: 1.1.3
attention: medium
---
# v1.1.3

## User-facing Highlights (zh)
- **中文标题**: 中文内容

## User-facing Highlights (en)
- **English title**: English body
"""

    zh = parse_release_notes(body, "v1.1.3", locale="zh")
    en = parse_release_notes(body, "v1.1.3", locale="en")

    assert zh.attention == "medium"
    assert [(item.title, item.body) for item in zh.items] == [
        ("中文标题", "中文内容")
    ]
    assert [(item.title, item.body) for item in en.items] == [
        ("English title", "English body")
    ]


def test_repository_release_notes_match_package_version() -> None:
    body = Path("src/ai_anime/release-notes.md").read_text(encoding="utf-8")
    validate_version_marker(body, "1.1.3")
    assert parse_release_notes(body, "v1.1.3", locale="zh").items
    assert parse_release_notes(body, "v1.1.3", locale="en").items


@pytest.mark.asyncio
async def test_noop_release_feed_is_empty() -> None:
    feed = await NoOpReleaseFeed().current(locale="zh")
    assert feed.source == "none"
    assert feed.current_items == []


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (None, "zh"),
        ("zh-CN,zh;q=0.9", "zh"),
        ("en-US", "en"),
        ("fr-FR", "zh"),
    ],
)
def test_release_notification_locale_normalization(
    value: str | None,
    expected: str,
) -> None:
    assert normalize_release_locale(value) == expected


@pytest.mark.asyncio
async def test_release_notification_queries_normalize_locale_before_gateway() -> None:
    seen: list[str] = []

    class Feed:
        async def current(self, *, locale: str) -> ReleaseFeed:
            seen.append(locale)
            return ReleaseFeed(source="none")

    result = await ReleaseNotificationQueries(Feed()).current(
        locale_hint="en-US,en;q=0.9",
    )

    assert result.source == "none"
    assert seen == ["en"]


def test_release_notification_api_returns_noop_feed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setitem(
        port_registry._PORTS,
        "release_feed",
        NoOpReleaseFeed(),
    )
    app = FastAPI()
    app.include_router(release_notifications.router, prefix="/api/v1")
    app.dependency_overrides[get_api_user] = lambda: {"username": "desktop"}

    response = TestClient(app).get("/api/v1/release-notifications?locale=en")

    assert response.status_code == 200
    assert response.json()["data"]["source"] == "none"
    assert response.json()["data"]["latest_tag"] is None
