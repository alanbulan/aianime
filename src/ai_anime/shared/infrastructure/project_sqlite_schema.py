"""Project SQLite schema and backwards-compatible migrations."""

from __future__ import annotations

import logging
import sqlite3

import aiosqlite

logger = logging.getLogger(__name__)


SQLITE_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS characters (
    name              TEXT PRIMARY KEY,
    aliases_json      TEXT DEFAULT '[]',
    role              TEXT DEFAULT '',
    is_main           INTEGER DEFAULT 0,
    gender            TEXT DEFAULT '',
    age_group         TEXT DEFAULT 'youth',
    body_type         TEXT DEFAULT '',
    fish_voice_id     TEXT DEFAULT '',
    description       TEXT DEFAULT '',
    face_prompt       TEXT DEFAULT '',
    appearance_details TEXT DEFAULT '',
    identities_json   TEXT DEFAULT '[]',
    created_at        TEXT DEFAULT (datetime('now')),
    updated_at        TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS episodes (
    number            INTEGER PRIMARY KEY,
    title             TEXT DEFAULT '',
    chapter_start     INTEGER DEFAULT 0,
    chapter_end       INTEGER DEFAULT 0,
    beat_source_text  TEXT DEFAULT '',
    content_summary   TEXT DEFAULT '',
    main_conflict     TEXT DEFAULT '',
    cliffhanger       TEXT DEFAULT '',
    key_events        TEXT DEFAULT '[]',
    character_names   TEXT DEFAULT '[]',
    identity_ids      TEXT DEFAULT '[]',
    event_ids         TEXT DEFAULT '[]',
    scene_menu_json   TEXT DEFAULT '[]',
    prop_menu_json    TEXT DEFAULT '[]',
    identity_default_map_json TEXT DEFAULT '{}',
    sketch_colors_json TEXT DEFAULT '{}',
    raw_content       TEXT DEFAULT '',
    adapted_content   TEXT DEFAULT '',
    created_at        TEXT DEFAULT (datetime('now')),
    updated_at        TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS scenes (
    name               TEXT PRIMARY KEY,
    aliases_json       TEXT DEFAULT '[]',
    scene_type         TEXT DEFAULT 'interior',
    base_scene_id      TEXT DEFAULT '',
    variant_id         TEXT DEFAULT '',
    time_of_day        TEXT DEFAULT '',
    environment_prompt TEXT DEFAULT '',
    variant_prompt     TEXT DEFAULT '',
    description        TEXT DEFAULT '',
    spatial_layout_image TEXT DEFAULT '',
    notes              TEXT DEFAULT '',
    created_at         TEXT DEFAULT (datetime('now')),
    updated_at         TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS props (
    name               TEXT PRIMARY KEY,
    aliases_json       TEXT DEFAULT '[]',
    prop_type          TEXT DEFAULT 'object',
    visual_prompt      TEXT DEFAULT '',
    description        TEXT DEFAULT '',
    owner              TEXT DEFAULT '',
    notes              TEXT DEFAULT '',
    created_at         TEXT DEFAULT (datetime('now')),
    updated_at         TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS beats (
    episode_number         INTEGER NOT NULL,
    beat_number            INTEGER NOT NULL,
    narration              TEXT DEFAULT '',
    visual_description     TEXT DEFAULT '',
    detected_identities_json TEXT DEFAULT '[]',
    detected_props_json    TEXT DEFAULT '[]',
    scene_ref_json         TEXT DEFAULT '',
    audio_type             TEXT DEFAULT 'narration',
    speaker                TEXT DEFAULT '',
    speaker_kind           TEXT DEFAULT 'character',
    time_of_day            TEXT DEFAULT '',
    video_mode             TEXT DEFAULT 'first_frame',
    video_prompt           TEXT DEFAULT '',
    keyframe_prompt        TEXT DEFAULT '',
    shot_order             INTEGER,
    duration_seconds       REAL,
    is_manual_shot         INTEGER DEFAULT 0,
    created_at             TEXT DEFAULT (datetime('now')),
    updated_at             TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (episode_number, beat_number)
);

CREATE INDEX IF NOT EXISTS idx_beats_episode ON beats(episode_number);

CREATE TABLE IF NOT EXISTS sketch_failure_modes (
    code                   TEXT PRIMARY KEY,
    layer                  TEXT NOT NULL,
    detection              TEXT NOT NULL,
    prevention_rule        TEXT DEFAULT '',
    correction_template    TEXT DEFAULT '',
    negative_prompt_clause TEXT DEFAULT '',
    gate_enabled           INTEGER DEFAULT 0,
    fixture_path           TEXT DEFAULT '',
    first_seen_episode     INTEGER DEFAULT -1,
    hit_count              INTEGER DEFAULT 0,
    created_at             TEXT DEFAULT (datetime('now')),
    updated_at             TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_failure_modes_layer ON sketch_failure_modes(layer);
CREATE INDEX IF NOT EXISTS idx_failure_modes_gate_enabled ON sketch_failure_modes(gate_enabled);

CREATE TABLE IF NOT EXISTS convergence_rounds (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    episode_number      INTEGER NOT NULL,
    phase               TEXT NOT NULL,
    round_num           INTEGER NOT NULL,
    residual_count      INTEGER DEFAULT 0,
    fixed_count         INTEGER DEFAULT 0,
    new_failures_json   TEXT DEFAULT '[]',
    started_at          TEXT DEFAULT (datetime('now')),
    ended_at            TEXT
);
CREATE INDEX IF NOT EXISTS idx_convergence_episode_phase ON convergence_rounds(episode_number, phase);

-- Director OS phase 2: project-local hit tracking for failure modes.
-- The canonical *definitions* live in the user-shared verification.db; this
-- table only stores per-project usage stats so each project's hit_count /
-- first_seen_episode stays isolated (the definitions are shared knowledge,
-- the hits are project facts).
-- The legacy `sketch_failure_modes` table above is kept untouched during the
-- phase-1-to-phase-2 transition and will be deprecated once verification.db
-- is the single source of truth for defs.
CREATE TABLE IF NOT EXISTS sketch_failure_mode_hits (
    code                TEXT PRIMARY KEY,
    first_seen_episode  INTEGER DEFAULT -1,
    hit_count           INTEGER DEFAULT 0,
    last_seen_at        TEXT DEFAULT (datetime('now'))
);

-- IndexTTS2 / Seedance 2.0 voice provenance (Stage A: NiceGUI cutover).
-- Mirrors the standalone schema in seedance2_i2v/voice_audio_records.py so the
-- table exists immediately on store init rather than lazily on first audio call.
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


async def _table_columns(db: aiosqlite.Connection, table: str) -> set[str]:
    async with db.execute(f"PRAGMA table_info({table})") as cursor:
        rows = await cursor.fetchall()
    return {str(row["name"]) for row in rows}


async def _add_column_if_missing(
    db: aiosqlite.Connection,
    table: str,
    name: str,
    definition: str,
) -> None:
    """Add a column while tolerating concurrent runtime schema bootstrap.

    SQLite has no portable ``ADD COLUMN IF NOT EXISTS``. Multiple API/worker
    processes can initialize the same project DB at once, so a column may be
    added after our ``PRAGMA table_info`` read but before ``ALTER TABLE``.
    """
    if name in await _table_columns(db, table):
        return

    try:
        await db.execute(f"ALTER TABLE {table} ADD COLUMN {name} {definition}")
    except sqlite3.OperationalError as exc:
        if "duplicate column name" not in str(exc).lower():
            raise
        if name not in await _table_columns(db, table):
            raise
        logger.debug("SQLite column already added concurrently: %s.%s", table, name)



__all__ = ["SQLITE_SCHEMA_SQL"]
