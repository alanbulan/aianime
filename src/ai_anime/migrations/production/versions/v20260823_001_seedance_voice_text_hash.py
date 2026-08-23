"""Add the text hash used to validate Seedance voice reuse."""

from __future__ import annotations

import sqlite3

VERSION = "20260823_001_seedance_voice_text_hash"


def apply(conn: sqlite3.Connection) -> None:
    columns = {
        str(row[1])
        for row in conn.execute(
            "PRAGMA table_info(seedance2_voice_audio_records)"
        ).fetchall()
    }
    if "text_sha256" not in columns:
        conn.execute(
            "ALTER TABLE seedance2_voice_audio_records "
            "ADD COLUMN text_sha256 TEXT NOT NULL DEFAULT ''"
        )


__all__ = ["VERSION", "apply"]
