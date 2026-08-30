"""Shared synchronous SQLite migration execution."""

from __future__ import annotations

import sqlite3
from collections.abc import Callable, Sequence

SQLiteMigration = tuple[str, Callable[[sqlite3.Connection], None]]


def run_sqlite_migrations(
    conn: sqlite3.Connection,
    migrations: Sequence[SQLiteMigration],
) -> None:
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
    for version, migrate in migrations:
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


__all__ = ["SQLiteMigration", "run_sqlite_migrations"]
