"""Project database migration runner."""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from pathlib import Path

import aiosqlite

from ai_anime.migrations.sqlite import ensure_sqlite_schema
from ai_anime.shared.infrastructure.sqlite_pragmas import (
    configure_sqlite_connection_async,
)

from .versions.v00000000_000_initial_schema import (
    VERSION as INITIAL_SCHEMA_VERSION,
    apply as apply_initial_schema,
)
from .versions.v20260823_001_path_safe_asset_names import (
    VERSION as PATH_SAFE_ASSET_NAMES_VERSION,
    apply as apply_path_safe_asset_names,
)
from .versions.v20260823_000_legacy_columns import (
    VERSION as LEGACY_COLUMNS_VERSION,
    apply as apply_legacy_columns,
)

MigrationRollback = Callable[[], None]
Migration = tuple[
    str,
    Callable[
        [aiosqlite.Connection, Path],
        Awaitable[MigrationRollback | None],
    ],
]

MIGRATIONS: tuple[Migration, ...] = (
    (INITIAL_SCHEMA_VERSION, apply_initial_schema),
    (LEGACY_COLUMNS_VERSION, apply_legacy_columns),
    (PATH_SAFE_ASSET_NAMES_VERSION, apply_path_safe_asset_names),
)

MIGRATION_VERSION = len(MIGRATIONS)


async def run_project_migrations(
    db: aiosqlite.Connection,
    *,
    project_dir: Path,
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

    for version, migrate in MIGRATIONS:
        if version in applied_versions:
            continue
        await db.execute("BEGIN IMMEDIATE")
        rollback_external: MigrationRollback | None = None
        try:
            async with db.execute(
                "SELECT 1 FROM schema_migrations WHERE version = ?",
                (version,),
            ) as cursor:
                already_applied = await cursor.fetchone() is not None
            if already_applied:
                await db.commit()
                continue
            rollback_external = await migrate(db, Path(project_dir))
            await db.execute(
                "INSERT INTO schema_migrations(version) VALUES (?)",
                (version,),
            )
            await db.commit()
        except BaseException:
            await db.rollback()
            if rollback_external is not None:
                rollback_external()
            raise


async def migrate_project_database(
    db_path: Path,
    *,
    project_dir: Path,
) -> None:
    db_path = Path(db_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    db = await aiosqlite.connect(str(db_path), timeout=10)
    try:
        db.row_factory = aiosqlite.Row
        await configure_sqlite_connection_async(db, set_journal_mode=False)
        await run_project_migrations(db, project_dir=Path(project_dir))
    finally:
        await db.close()


def migrate_project_database_sync(
    db_path: Path,
    *,
    project_dir: Path,
) -> None:
    path = Path(db_path).resolve()

    def initialize(_connection) -> None:
        asyncio.run(
            migrate_project_database(
                path,
                project_dir=Path(project_dir),
            )
        )

    ensure_sqlite_schema(
        path,
        component="project",
        version=MIGRATION_VERSION,
        initialize=initialize,
    )


__all__ = [
    "MIGRATIONS",
    "MIGRATION_VERSION",
    "migrate_project_database",
    "migrate_project_database_sync",
    "run_project_migrations",
]
