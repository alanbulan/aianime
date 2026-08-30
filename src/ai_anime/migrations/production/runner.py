"""Synchronous migration runner for production-owned project tables."""

from __future__ import annotations

import sqlite3

from ai_anime.migrations.sqlite import run_sqlite_migrations

from .versions.v20260823_000_initial_seedance_voice_records import (
    VERSION as INITIAL_VOICE_RECORDS_VERSION,
    apply as apply_initial_voice_records,
)
from .versions.v20260823_001_seedance_voice_text_hash import (
    VERSION as VOICE_TEXT_HASH_VERSION,
    apply as apply_voice_text_hash,
)

MIGRATIONS = (
    (INITIAL_VOICE_RECORDS_VERSION, apply_initial_voice_records),
    (VOICE_TEXT_HASH_VERSION, apply_voice_text_hash),
)
MIGRATION_VERSION = len(MIGRATIONS)


def run_production_migrations(conn: sqlite3.Connection) -> None:
    run_sqlite_migrations(conn, MIGRATIONS)


__all__ = ["MIGRATIONS", "MIGRATION_VERSION", "run_production_migrations"]
