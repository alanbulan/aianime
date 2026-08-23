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


__all__ = ["MIGRATIONS", "run_task_state_migrations"]
