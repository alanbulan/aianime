"""Remove provider-specific voice state from project character records."""

from __future__ import annotations

from pathlib import Path

import aiosqlite

VERSION = "20260831_002_remove_provider_voice_state"

_OBSOLETE_COLUMN = "fish_voice_id"
async def apply(db: aiosqlite.Connection, project_dir: Path) -> None:
    _ = project_dir
    async with db.execute("PRAGMA table_info(characters)") as cursor:
        columns = {str(row[1]) for row in await cursor.fetchall()}

    if "identities_json" in columns:
        await db.execute(
            """
            UPDATE characters
            SET identities_json = '[]'
            WHERE instr(lower(identities_json), ?) > 0
            """,
            (_OBSOLETE_COLUMN,),
        )

    if _OBSOLETE_COLUMN in columns:
        await db.execute(
            f"ALTER TABLE characters DROP COLUMN {_OBSOLETE_COLUMN}"
        )


__all__ = ["VERSION", "apply"]
