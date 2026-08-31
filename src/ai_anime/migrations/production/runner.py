"""Synchronous migration runner for production-owned project tables."""

from __future__ import annotations

import sqlite3

from ai_anime.migrations.sqlite import run_sqlite_migrations

from .versions.v20260831_000_generic_video_voice_records import (
    VERSION as VIDEO_VOICE_RECORDS_VERSION,
    apply as apply_video_voice_records,
)

MIGRATIONS = (
    (VIDEO_VOICE_RECORDS_VERSION, apply_video_voice_records),
)
# Schema component versions are monotonic even when obsolete migrations are removed.
MIGRATION_VERSION = 3


def run_production_migrations(conn: sqlite3.Connection) -> None:
    run_sqlite_migrations(conn, MIGRATIONS)


__all__ = ["MIGRATIONS", "MIGRATION_VERSION", "run_production_migrations"]
