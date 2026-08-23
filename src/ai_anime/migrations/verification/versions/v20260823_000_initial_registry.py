"""Create the shared verification registry schema."""

from __future__ import annotations

import sqlite3

import aiosqlite

VERSION = "20260823_000_initial_verification_registry"

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS sketch_failure_mode_defs (
    code                     TEXT PRIMARY KEY,
    layer                    TEXT NOT NULL,
    detection                TEXT NOT NULL,
    prevention_rule          TEXT DEFAULT '',
    correction_template      TEXT DEFAULT '',
    negative_prompt_clause   TEXT DEFAULT '',
    gate_enabled             INTEGER DEFAULT 0,
    fixture_path             TEXT DEFAULT '',
    created_at               TEXT DEFAULT (datetime('now')),
    updated_at               TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_defs_layer ON sketch_failure_mode_defs(layer);
CREATE INDEX IF NOT EXISTS idx_defs_gate_enabled ON sketch_failure_mode_defs(gate_enabled);
"""


async def apply_async(db: aiosqlite.Connection) -> None:
    await db.executescript(SCHEMA_SQL)


def apply_sync(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA_SQL)


__all__ = ["SCHEMA_SQL", "VERSION", "apply_async", "apply_sync"]
