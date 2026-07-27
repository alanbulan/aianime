"""Release feed values and version rules."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

from packaging.version import InvalidVersion, Version

Attention = Literal["low", "medium", "high"]


@dataclass(frozen=True)
class ReleaseItem:
    id: str
    kind: str
    icon: str
    title: str
    body: str


@dataclass(frozen=True)
class ReleaseFeed:
    source: Literal["mock", "remote", "none"]
    current_version: str | None = None
    current_tag: str | None = None
    current_items: list[ReleaseItem] = field(default_factory=list)
    update_available: bool = False
    latest_version: str | None = None
    latest_tag: str | None = None
    release_url: str | None = None
    update_items: list[ReleaseItem] = field(default_factory=list)
    attention: Attention = "low"
    latest_published_at: str | None = None


def is_newer_release(candidate: str, current: str) -> bool:
    try:
        return Version(candidate) > Version(current)
    except InvalidVersion:
        return candidate > current
