"""Synchronous migration runner for project-local model-usage tables."""

from __future__ import annotations

import sqlite3

from .versions.v20260823_000_initial_usage_tables import VERSION, apply

MIGRATIONS = ((VERSION, apply),)


def run_model_usage_migrations(conn: sqlite3.Connection) -> None:
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


__all__ = ["MIGRATIONS", "run_model_usage_migrations"]
