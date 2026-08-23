"""Add routing and ownership columns to legacy task-state tables."""

from __future__ import annotations

import sqlite3

VERSION = "20260823_001_task_state_routing_columns"


def apply(conn: sqlite3.Connection) -> None:
    columns = {
        str(row[1])
        for row in conn.execute("PRAGMA table_info(task_states)").fetchall()
    }
    definitions = {
        "queue_kind": "TEXT NOT NULL DEFAULT 'default'",
        "project_id": "TEXT NOT NULL DEFAULT ''",
        "requester_user_id": "TEXT NOT NULL DEFAULT ''",
        "owner_username": "TEXT NOT NULL DEFAULT ''",
        "project_name": "TEXT NOT NULL DEFAULT ''",
    }
    for name, definition in definitions.items():
        if name not in columns:
            conn.execute(
                f"ALTER TABLE task_states ADD COLUMN {name} {definition}"
            )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_task_states_project_updated "
        "ON task_states(project_id, updated_at DESC)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_task_states_project_queue_status "
        "ON task_states(project_id, queue_kind, status)"
    )


__all__ = ["VERSION", "apply"]
