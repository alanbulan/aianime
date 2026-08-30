"""Synchronous migration runner for task-state connections."""

from __future__ import annotations

import sqlite3

from ai_anime.migrations.sqlite import run_sqlite_migrations

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
    run_sqlite_migrations(conn, MIGRATIONS)


__all__ = ["MIGRATIONS", "MIGRATION_VERSION", "run_task_state_migrations"]
