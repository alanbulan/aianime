"""Create project-local image, video, and audio usage tables."""

from __future__ import annotations

import sqlite3

VERSION = "20260823_000_initial_model_usage"

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS image_request_usage (
    request_id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    model_name TEXT,
    task_type TEXT NOT NULL,
    scope TEXT NOT NULL,
    episode INTEGER,
    beat_num INTEGER,
    character_name TEXT,
    identity_name TEXT,
    status TEXT NOT NULL DEFAULT 'accepted',
    accepted_at TEXT NOT NULL,
    completed_at TEXT,
    updated_at TEXT NOT NULL,
    error_message TEXT
);
CREATE INDEX IF NOT EXISTS idx_image_request_usage_scope
ON image_request_usage(task_type, scope, accepted_at DESC);

CREATE TABLE IF NOT EXISTS video_request_usage (
    request_id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    model_name TEXT,
    episode INTEGER,
    beat_num INTEGER,
    task_type TEXT,
    duration_seconds REAL,
    status TEXT NOT NULL DEFAULT 'accepted',
    cost_estimate REAL,
    accepted_at TEXT NOT NULL,
    completed_at TEXT,
    downloaded_at TEXT,
    updated_at TEXT NOT NULL,
    error_message TEXT
);
CREATE INDEX IF NOT EXISTS idx_video_request_usage_episode
ON video_request_usage(episode, beat_num, accepted_at DESC);

CREATE TABLE IF NOT EXISTS audio_request_usage (
    request_id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    model_name TEXT,
    task_type TEXT NOT NULL,
    scope TEXT NOT NULL,
    episode INTEGER,
    speaker TEXT,
    status TEXT NOT NULL DEFAULT 'accepted',
    accepted_at TEXT NOT NULL,
    completed_at TEXT,
    updated_at TEXT NOT NULL,
    error_message TEXT
);
CREATE INDEX IF NOT EXISTS idx_audio_request_usage_scope
ON audio_request_usage(task_type, scope, accepted_at DESC);
"""


def apply(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA_SQL)


__all__ = ["SCHEMA_SQL", "VERSION", "apply"]
