"""Migration runners for shared verification databases."""

from __future__ import annotations

import sqlite3
from collections.abc import Awaitable, Callable

import aiosqlite

from .versions.v20260823_000_initial_registry import (
    VERSION as REGISTRY_VERSION,
    apply_async as apply_registry_async,
    apply_sync as apply_registry_sync,
)
from .versions.v20260823_000_initial_training import (
    VERSION as TRAINING_VERSION,
    apply as apply_training,
    apply_sync as apply_training_sync,
)

AsyncMigration = tuple[str, Callable[[aiosqlite.Connection], Awaitable[None]]]
SyncMigration = tuple[str, Callable[[sqlite3.Connection], None]]

REGISTRY_ASYNC_MIGRATIONS: tuple[AsyncMigration, ...] = (
    (REGISTRY_VERSION, apply_registry_async),
)
REGISTRY_SYNC_MIGRATIONS: tuple[SyncMigration, ...] = (
    (REGISTRY_VERSION, apply_registry_sync),
)
TRAINING_MIGRATIONS: tuple[AsyncMigration, ...] = (
    (TRAINING_VERSION, apply_training),
)
TRAINING_SYNC_MIGRATIONS: tuple[SyncMigration, ...] = (
    (TRAINING_VERSION, apply_training_sync),
)
REGISTRY_MIGRATION_VERSION = len(REGISTRY_SYNC_MIGRATIONS)
TRAINING_MIGRATION_VERSION = len(TRAINING_SYNC_MIGRATIONS)


async def _run_async_migrations(
    db: aiosqlite.Connection,
    migrations: tuple[AsyncMigration, ...],
) -> None:
    await db.execute(
        """
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version TEXT PRIMARY KEY,
            applied_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
        """
    )
    await db.commit()
    async with db.execute("SELECT version FROM schema_migrations") as cursor:
        applied_versions = {str(row[0]) for row in await cursor.fetchall()}
    for version, migrate in migrations:
        if version in applied_versions:
            continue
        await db.execute("BEGIN IMMEDIATE")
        try:
            await migrate(db)
            await db.execute(
                "INSERT INTO schema_migrations(version) VALUES (?)",
                (version,),
            )
            await db.commit()
        except BaseException:
            await db.rollback()
            raise


def _run_sync_migrations(
    conn: sqlite3.Connection,
    migrations: tuple[SyncMigration, ...],
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


async def run_verification_registry_migrations(
    db: aiosqlite.Connection,
) -> None:
    await _run_async_migrations(db, REGISTRY_ASYNC_MIGRATIONS)


def run_verification_registry_migrations_sync(
    conn: sqlite3.Connection,
) -> None:
    _run_sync_migrations(conn, REGISTRY_SYNC_MIGRATIONS)


async def run_training_db_migrations(db: aiosqlite.Connection) -> None:
    await _run_async_migrations(db, TRAINING_MIGRATIONS)


def run_training_db_migrations_sync(conn: sqlite3.Connection) -> None:
    _run_sync_migrations(conn, TRAINING_SYNC_MIGRATIONS)


__all__ = [
    "REGISTRY_ASYNC_MIGRATIONS",
    "REGISTRY_MIGRATION_VERSION",
    "REGISTRY_SYNC_MIGRATIONS",
    "TRAINING_MIGRATION_VERSION",
    "TRAINING_MIGRATIONS",
    "TRAINING_SYNC_MIGRATIONS",
    "run_training_db_migrations",
    "run_training_db_migrations_sync",
    "run_verification_registry_migrations",
    "run_verification_registry_migrations_sync",
]
