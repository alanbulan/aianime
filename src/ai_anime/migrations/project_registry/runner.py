"""Migration runner for the local project registry."""

from __future__ import annotations

from datetime import datetime, timezone

import aiosqlite

from .versions.v1_initial_registry import VERSION, apply

MIGRATIONS = ((VERSION, apply),)


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
    for version, migrate in MIGRATIONS:
        await db.execute("BEGIN IMMEDIATE")
        try:
            async with db.execute(
                "SELECT 1 FROM schema_migrations WHERE version = ?",
                (version,),
            ) as cursor:
                applied = await cursor.fetchone() is not None
            if not applied:
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


__all__ = ["MIGRATIONS", "run_project_registry_migrations"]
