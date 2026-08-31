"""Rewrite persisted beat audio types to the canonical vocabulary."""

from __future__ import annotations

from pathlib import Path

import aiosqlite


VERSION = "20260831_001_canonical_audio_types"

async def apply(db: aiosqlite.Connection, project_dir: Path) -> None:
    _ = project_dir
    async with db.execute("PRAGMA table_info(beats)") as cursor:
        columns = {str(row[1]) for row in await cursor.fetchall()}
    if "audio_type" not in columns:
        return

    await db.execute(
        """
        UPDATE beats
        SET audio_type = CASE
            WHEN lower(trim(coalesce(audio_type, ''))) IN (?, ?, ?)
                THEN lower(trim(audio_type))
            ELSE 'silence'
        END
        """,
        ("silence", "narration", "dialogue"),
    )


__all__ = ["VERSION", "apply"]
