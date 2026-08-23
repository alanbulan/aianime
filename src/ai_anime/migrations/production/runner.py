"""Synchronous migration runner for production-owned project tables."""

from __future__ import annotations

import sqlite3

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
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version TEXT PRIMARY KEY,
            applied_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
        """
    )
    conn.commit()
    applied_versions = {
        str(row[0])
        for row in conn.execute("SELECT version FROM schema_migrations").fetchall()
    }
    for version, migrate in MIGRATIONS:
        if version in applied_versions:
            continue
        conn.execute("BEGIN IMMEDIATE")
        try:
            migrate(conn)
            conn.execute(
                "INSERT INTO schema_migrations(version) VALUES (?)",
                (version,),
            )
            conn.commit()
        except BaseException:
            conn.rollback()
            raise


__all__ = ["MIGRATIONS", "MIGRATION_VERSION", "run_production_migrations"]
