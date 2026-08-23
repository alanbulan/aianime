"""Create the baseline schema for project-scoped SQLite databases."""

from __future__ import annotations

from pathlib import Path

import aiosqlite

VERSION = "00000000_000_initial_schema"

SCHEMA_SQL = """
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

CREATE TABLE IF NOT EXISTS sketch_failure_mode_hits (
    code                TEXT PRIMARY KEY,
    first_seen_episode  INTEGER DEFAULT -1,
    hit_count           INTEGER DEFAULT 0,
    last_seen_at        TEXT DEFAULT (datetime('now'))
);

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


async def apply(db: aiosqlite.Connection, project_dir: Path) -> None:
    _ = project_dir
    await db.executescript(SCHEMA_SQL)


__all__ = ["SCHEMA_SQL", "VERSION", "apply"]
