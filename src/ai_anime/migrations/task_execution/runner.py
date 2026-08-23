"""Synchronous migration runner for task-state connections."""

from __future__ import annotations

import sqlite3

from .versions.v20260823_000_initial_task_state import (
    VERSION as INITIAL_TASK_STATE_VERSION,
    apply as apply_initial_task_state,
)
from .versions.v20260823_001_task_state_routing_columns import (
    VERSION as ROUTING_COLUMNS_VERSION,
    apply as apply_routing_columns,
)

MIGRATIONS = (
    (INITIAL_TASK_STATE_VERSION, apply_initial_task_state),
    (ROUTING_COLUMNS_VERSION, apply_routing_columns),
)
MIGRATION_VERSION = len(MIGRATIONS)


def run_task_state_migrations(conn: sqlite3.Connection) -> None:
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


__all__ = ["MIGRATIONS", "MIGRATION_VERSION", "run_task_state_migrations"]
