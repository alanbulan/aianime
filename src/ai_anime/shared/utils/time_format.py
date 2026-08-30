"""Canonical UTC timestamp formatting shared by persisted state."""

from __future__ import annotations

from datetime import datetime, timezone


def utc_iso(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def utc_now_iso() -> str:
    return utc_iso(datetime.now(timezone.utc))


__all__ = ["utc_iso", "utc_now_iso"]
