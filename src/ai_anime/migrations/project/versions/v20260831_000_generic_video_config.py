"""Move per-beat video settings to the provider-neutral column."""

from __future__ import annotations

from pathlib import Path

import aiosqlite

VERSION = "20260831_000_generic_video_config"


async def apply(db: aiosqlite.Connection, project_dir: Path) -> None:
    _ = project_dir
    async with db.execute("PRAGMA table_info(beats)") as cursor:
        columns = {str(row[1]) for row in await cursor.fetchall()}
    legacy_column = "seedance2_config_json"
    canonical_column = "video_config_json"
    if canonical_column not in columns:
        await db.execute(
            "ALTER TABLE beats ADD COLUMN "
            "video_config_json TEXT NOT NULL DEFAULT '{}'"
        )
    if legacy_column in columns:
        await db.execute("UPDATE beats SET video_config_json = '{}'")
        await db.execute(f"ALTER TABLE beats DROP COLUMN {legacy_column}")


__all__ = ["VERSION", "apply"]
