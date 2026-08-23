"""Create the shared director-training schema."""

from __future__ import annotations

import aiosqlite
import sqlite3

VERSION = "20260823_000_initial_director_training"

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS sketch_format_versions (
    version                  TEXT PRIMARY KEY,
    description              TEXT DEFAULT '',
    style_lock_artifact_path TEXT NOT NULL,
    created_at               TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS accepted_sketch_samples (
    sample_id                       TEXT PRIMARY KEY,
    project                         TEXT NOT NULL,
    episode_number                  INTEGER NOT NULL,
    beat_number                     INTEGER NOT NULL,
    scene_id                        TEXT,
    audio_type                      TEXT,
    narration_segment               TEXT,
    visual_description              TEXT,
    sketch_colors_json              TEXT,
    identity_markers_json           TEXT,
    sketch_format_version           TEXT NOT NULL,
    sketch_artifact_path            TEXT NOT NULL,
    sketch_sha256                   TEXT NOT NULL,
    observed_by_current_gate        TEXT,
    observed_gate_registry_version  TEXT,
    backfilled_at                   TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_samples_sketch_sha
    ON accepted_sketch_samples(sketch_sha256);
CREATE INDEX IF NOT EXISTS idx_samples_project_ep
    ON accepted_sketch_samples(project, episode_number, beat_number);

CREATE TABLE IF NOT EXISTS live_edit_traces (
    trace_id                   TEXT PRIMARY KEY,
    source_run_id              TEXT NOT NULL,
    parent_trace_id            TEXT,
    project                    TEXT NOT NULL,
    episode_number             INTEGER NOT NULL,
    beat_number                INTEGER NOT NULL,
    scene_id                   TEXT,
    audio_type                 TEXT,
    model_name                 TEXT NOT NULL,
    prompt_version             TEXT NOT NULL,
    registry_version           TEXT NOT NULL,
    sketch_format_version      TEXT NOT NULL,
    prompt_artifact_path       TEXT,
    prompt_sha256              TEXT,
    prompt_size_bytes          INTEGER,
    response_artifact_path     TEXT,
    response_sha256            TEXT,
    response_size_bytes        INTEGER,
    gate_verdict_artifact_path TEXT,
    gate_verdict_sha256        TEXT,
    edit_instruction           TEXT,
    failure_codes_observed     TEXT,
    gate_result                TEXT,
    trace_kind                 TEXT NOT NULL,
    final_status               TEXT NOT NULL DEFAULT 'pending',
    human_override_status      TEXT,
    human_override_reason      TEXT,
    input_sketch_path          TEXT,
    input_sketch_sha256        TEXT,
    output_sketch_path         TEXT,
    output_sketch_sha256       TEXT,
    input_grid_path            TEXT,
    input_grid_sha256          TEXT,
    output_grid_path           TEXT,
    output_grid_sha256         TEXT,
    created_at                 TEXT DEFAULT (datetime('now')),
    completed_at               TEXT
);
CREATE INDEX IF NOT EXISTS idx_traces_project_ep
    ON live_edit_traces(project, episode_number, beat_number);
CREATE INDEX IF NOT EXISTS idx_traces_run
    ON live_edit_traces(source_run_id);
CREATE INDEX IF NOT EXISTS idx_traces_final
    ON live_edit_traces(final_status);

CREATE TABLE IF NOT EXISTS reject_buffer (
    reject_id              TEXT PRIMARY KEY,
    source_trace_id        TEXT,
    project                TEXT,
    episode_number         INTEGER,
    beat_number            INTEGER,
    failure_codes          TEXT,
    gate_verdict_sha256    TEXT,
    sketch_artifact_path   TEXT NOT NULL,
    sketch_sha256          TEXT NOT NULL,
    rejected_at            TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_rejects_sketch_sha ON reject_buffer(sketch_sha256);

CREATE TABLE IF NOT EXISTS human_override_events (
    event_id   TEXT PRIMARY KEY,
    trace_id   TEXT NOT NULL,
    verdict    TEXT NOT NULL,
    reason     TEXT,
    actor      TEXT,
    at         TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_events_trace ON human_override_events(trace_id);
"""


async def apply(db: aiosqlite.Connection) -> None:
    await db.executescript(SCHEMA_SQL)


def apply_sync(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA_SQL)


__all__ = ["SCHEMA_SQL", "VERSION", "apply", "apply_sync"]
