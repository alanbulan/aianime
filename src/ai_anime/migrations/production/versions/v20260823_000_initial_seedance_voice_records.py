"""Create the Seedance voice provenance schema."""

from __future__ import annotations

import sqlite3

VERSION = "20260823_000_initial_seedance_voice_records"

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS seedance2_voice_audio_records (
    episode_number INTEGER NOT NULL,
    beat_number INTEGER NOT NULL,
    speaker TEXT NOT NULL,
    audio_path TEXT NOT NULL,
    voice_sha256 TEXT NOT NULL,
    text_sha256 TEXT NOT NULL DEFAULT '',
    mode TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    generated_at TEXT NOT NULL,
    status TEXT NOT NULL,
    error TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (episode_number, beat_number, speaker)
);
CREATE INDEX IF NOT EXISTS idx_seedance2_voice_audio_speaker
ON seedance2_voice_audio_records(episode_number, speaker);
"""


def apply(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA_SQL)


__all__ = ["SCHEMA_SQL", "VERSION", "apply"]
