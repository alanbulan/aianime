"""Migration runner for the local project registry."""

from __future__ import annotations

import sqlite3
from datetime import datetime, timezone

import aiosqlite

from .versions.v1_initial_registry import VERSION, apply, apply_sync

MIGRATIONS = ((VERSION, apply),)
SYNC_MIGRATIONS = ((VERSION, apply_sync),)
MIGRATION_VERSION = max(version for version, _migration in SYNC_MIGRATIONS)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def run_project_registry_migrations(db: aiosqlite.Connection) -> None:
    await db.execute(
        """
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            applied_at TEXT NOT NULL
        )
        """
    )
    await db.commit()
    async with db.execute("SELECT version FROM schema_migrations") as cursor:
        applied_versions = {int(row[0]) for row in await cursor.fetchall()}
    for version, migrate in MIGRATIONS:
        if version in applied_versions:
            continue
        await db.execute("BEGIN IMMEDIATE")
        try:
            await migrate(db)
            await db.execute(
                "INSERT INTO schema_migrations(version, applied_at) "
                "VALUES (?, ?)",
                (version, _now_iso()),
            )
            await db.commit()
        except BaseException:
            await db.rollback()
            raise


def run_project_registry_migrations_sync(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            applied_at TEXT NOT NULL
        )
        """
    )
    conn.commit()
    applied_versions = {
        int(row[0])
        for row in conn.execute("SELECT version FROM schema_migrations").fetchall()
    }
    for version, migrate in SYNC_MIGRATIONS:
        if version in applied_versions:
            continue
        conn.execute("BEGIN IMMEDIATE")
        try:
            migrate(conn)
            conn.execute(
                "INSERT INTO schema_migrations(version, applied_at) "
                "VALUES (?, ?)",
                (version, _now_iso()),
            )
            conn.commit()
        except BaseException:
            conn.rollback()
            raise


__all__ = [
    "MIGRATIONS",
    "MIGRATION_VERSION",
    "SYNC_MIGRATIONS",
    "run_project_registry_migrations",
    "run_project_registry_migrations_sync",
]
