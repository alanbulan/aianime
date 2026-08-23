"""Create the project-local task-state schema."""

from __future__ import annotations

import sqlite3

VERSION = "20260823_000_initial_task_state"

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS task_states (
    task_key TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    task_type TEXT NOT NULL,
    queue_kind TEXT NOT NULL DEFAULT 'default',
    project_id TEXT NOT NULL DEFAULT '',
    requester_user_id TEXT NOT NULL DEFAULT '',
    owner_username TEXT NOT NULL DEFAULT '',
    project_name TEXT NOT NULL DEFAULT '',
    username TEXT NOT NULL,
    project TEXT NOT NULL,
    episode INTEGER NOT NULL,
    beat_num INTEGER,
    status TEXT NOT NULL,
    progress REAL NOT NULL DEFAULT 0.0,
    current_task TEXT NOT NULL DEFAULT '',
    result_json TEXT,
    error TEXT,
    logs_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT '',
    completed_at TEXT NOT NULL DEFAULT '',
    expires_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_task_states_user_updated
ON task_states(username, updated_at DESC);
"""


def apply(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA_SQL)


__all__ = ["SCHEMA_SQL", "VERSION", "apply"]
