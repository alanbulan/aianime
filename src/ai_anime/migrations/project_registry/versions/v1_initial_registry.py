"""Create the local project registry schema."""

from __future__ import annotations

import sqlite3

import aiosqlite

VERSION = 1

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    owner_type TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    owner_username TEXT NOT NULL,
    name TEXT NOT NULL,
    home_node_id TEXT NOT NULL,
    output_dir TEXT NOT NULL,
    state_dir TEXT NOT NULL,
    runtime_dir TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    purged_at TEXT,
    UNIQUE(owner_type, owner_id, name)
);
CREATE INDEX IF NOT EXISTS projects_owner_updated_idx
    ON projects(owner_type, owner_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS projects_status_updated_idx
    ON projects(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS projects_home_node_idx
    ON projects(home_node_id);
"""


async def apply(db: aiosqlite.Connection) -> None:
    await db.executescript(SCHEMA_SQL)


def apply_sync(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA_SQL)


__all__ = ["SCHEMA_SQL", "VERSION", "apply", "apply_sync"]
