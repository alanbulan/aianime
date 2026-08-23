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
    for version, migrate in MIGRATIONS:
        conn.execute("BEGIN IMMEDIATE")
        try:
            applied = conn.execute(
                "SELECT 1 FROM schema_migrations WHERE version = ?",
                (version,),
            ).fetchone()
            if applied is None:
                migrate(conn)
                conn.execute(
                    "INSERT INTO schema_migrations(version) VALUES (?)",
                    (version,),
                )
            conn.commit()
        except BaseException:
            conn.rollback()
            raise


__all__ = ["MIGRATIONS", "run_production_migrations"]
