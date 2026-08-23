"""Create the scoped chat-history schema."""

from __future__ import annotations

import sqlite3

VERSION = "1_initial_chat_history"

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  media_json TEXT NOT NULL DEFAULT '[]',
  turn_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  conversation_id TEXT NOT NULL DEFAULT 'main',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS chat_ui_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  turn_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  conversation_id TEXT NOT NULL DEFAULT 'main',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_ui_events_conversation_turn
  ON chat_ui_events(conversation_id, turn_id, id);
CREATE TABLE IF NOT EXISTS chat_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation
  ON chat_messages(conversation_id, id);
CREATE TABLE IF NOT EXISTS chat_conversations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
"""


def apply(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA_SQL)


__all__ = ["SCHEMA_SQL", "VERSION", "apply"]
