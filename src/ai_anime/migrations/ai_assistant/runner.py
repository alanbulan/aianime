"""Synchronous migration runner for scoped chat databases."""

from __future__ import annotations

import sqlite3

from .versions.v1_initial_chat_history import VERSION, apply
from .versions.v2_message_context_state import (
    VERSION as MESSAGE_CONTEXT_VERSION,
    apply as apply_message_context,
)

MIGRATIONS = (
    (VERSION, apply),
    (MESSAGE_CONTEXT_VERSION, apply_message_context),
)
MIGRATION_VERSION = len(MIGRATIONS)


def run_chat_history_migrations(conn: sqlite3.Connection) -> None:
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


__all__ = ["MIGRATIONS", "MIGRATION_VERSION", "run_chat_history_migrations"]
