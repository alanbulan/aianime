"""Deterministic release feed used until the remote service is connected."""

from __future__ import annotations

import importlib.metadata
import os
from pathlib import Path
from typing import Callable

from packaging.version import InvalidVersion, Version

from ai_anime.ports.release_feed import ReleaseFeed, ReleaseItem
from ai_anime.release_notes import parse, validate_version_marker

PACKAGE_NAME = "ai-anime"
DEFAULT_LATEST_VERSION = "1.2.0"
DEFAULT_PUBLISHED_AT = "2026-07-22T00:00:00Z"

VersionReader = Callable[[], str]


class NoOpReleaseFeed:
    async def current(self, *, locale: str) -> ReleaseFeed:
        _ = locale
        return ReleaseFeed(source="none")


class MockReleaseFeed:
    def __init__(
        self,
        *,
        notes_path: Path | None = None,
        version_reader: VersionReader | None = None,
        latest_version: str | None = None,
    ) -> None:
        self._notes_path = notes_path
        self._version_reader = version_reader or (
            lambda: importlib.metadata.version(PACKAGE_NAME)
        )
        self._latest_version = latest_version

    async def current(self, *, locale: str) -> ReleaseFeed:
        current_version = self._read_current_version()
        current_tag = f"v{current_version}" if current_version else None
        current_items = self._read_current_items(
            current_version=current_version,
            current_tag=current_tag,
            locale=locale,
        )
        latest_version = (
            self._latest_version
            or os.environ.get(
                "AI_ANIME_MOCK_LATEST_VERSION", DEFAULT_LATEST_VERSION
            ).strip()
            or DEFAULT_LATEST_VERSION
        )
        update_available = bool(
            current_version and _is_newer(latest_version, current_version)
        )
        latest_tag = f"v{latest_version}" if update_available else None

        return ReleaseFeed(
            source="mock",
            current_version=current_version,
            current_tag=current_tag,
            current_items=current_items,
            update_available=update_available,
            latest_version=latest_version if update_available else None,
            latest_tag=latest_tag,
            release_url=(
                os.environ.get("AI_ANIME_RELEASE_URL", "").strip() or None
            )
            if update_available
            else None,
            update_items=_mock_update_items(locale, latest_tag)
            if update_available
            else [],
            attention="medium" if update_available else "low",
            latest_published_at=(
                os.environ.get(
                    "AI_ANIME_MOCK_RELEASE_PUBLISHED_AT", DEFAULT_PUBLISHED_AT
                ).strip()
                or DEFAULT_PUBLISHED_AT
            )
            if update_available
            else None,
        )

    def _read_current_version(self) -> str | None:
        try:
            return self._version_reader()
        except importlib.metadata.PackageNotFoundError:
            return None

    def _notes_file(self) -> Path:
        if self._notes_path is not None:
            return self._notes_path
        return Path(__file__).resolve().parents[2] / "release-notes.md"

    def _read_current_items(
        self,
        *,
        current_version: str | None,
        current_tag: str | None,
        locale: str,
    ) -> list[ReleaseItem]:
        if not current_version or not current_tag:
            return []
        try:
            body = self._notes_file().read_text(encoding="utf-8")
            validate_version_marker(body, current_version)
        except (OSError, ValueError):
            return []
        parsed = parse(body, current_tag, locale=locale)
        return [
            ReleaseItem(
                id=item.id,
                kind=item.kind,
                icon=item.icon,
                title=item.title,
                body=item.body,
            )
            for item in parsed.items
        ]


def _mock_update_items(locale: str, tag: str | None) -> list[ReleaseItem]:
    if not tag:
        return []
    if locale.lower().startswith("en"):
        title = "Remote release service placeholder"
        body = "This mock item will be replaced by your server response."
    else:
        title = "远程发布服务占位"
        body = "该模拟内容将在接入你们的服务器后由真实发布数据替换。"
    return [
        ReleaseItem(
            id=f"mock-release:{tag}",
            kind="release",
            icon="sparkles",
            title=title,
            body=body,
        )
    ]


def _is_newer(candidate: str, current: str) -> bool:
    try:
        return Version(candidate) > Version(current)
    except InvalidVersion:
        return candidate > current
