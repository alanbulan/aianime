"""Create the scoped chat-history schema."""

from __future__ import annotations

import sqlite3

VERSION = "1_initial_chat_history"

TABLE_STATEMENTS = (
    """CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  media_json TEXT NOT NULL DEFAULT '[]',
  turn_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  conversation_id TEXT NOT NULL DEFAULT 'main',
  created_at TEXT NOT NULL
)
""",
    """CREATE TABLE IF NOT EXISTS chat_ui_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  turn_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  conversation_id TEXT NOT NULL DEFAULT 'main',
  created_at TEXT NOT NULL
)
""",
    """CREATE TABLE IF NOT EXISTS chat_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
)
""",
    """CREATE TABLE IF NOT EXISTS chat_conversations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)
""",
)

COLUMN_UPGRADES = {
    "chat_messages": (
        ("metadata_json", "TEXT NOT NULL DEFAULT '{}'"),
        ("conversation_id", "TEXT NOT NULL DEFAULT 'main'"),
    ),
    "chat_ui_events": (
        ("conversation_id", "TEXT NOT NULL DEFAULT 'main'"),
    ),
    "chat_conversations": (
        ("title", "TEXT NOT NULL DEFAULT ''"),
        ("created_at", "TEXT NOT NULL DEFAULT ''"),
        ("updated_at", "TEXT NOT NULL DEFAULT ''"),
    ),
}

INDEX_STATEMENTS = (
    """CREATE INDEX IF NOT EXISTS idx_chat_ui_events_conversation_turn
  ON chat_ui_events(conversation_id, turn_id, id)
""",
    """CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation
  ON chat_messages(conversation_id, id)
""",
)

SCHEMA_SQL = ";\n".join((*TABLE_STATEMENTS, *INDEX_STATEMENTS)) + ";\n"


def _column_names(conn: sqlite3.Connection, table: str) -> set[str]:
    return {
        str(row[1])
        for row in conn.execute(f"PRAGMA table_info({table})").fetchall()
    }


def _add_missing_columns(conn: sqlite3.Connection) -> None:
    for table, columns in COLUMN_UPGRADES.items():
        existing = _column_names(conn, table)
        for column, declaration in columns:
            if column in existing:
                continue
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {declaration}")
            existing.add(column)


def _backfill_conversations(conn: sqlite3.Connection) -> None:
    for table in ("chat_messages", "chat_ui_events"):
        conn.execute(
            f"UPDATE {table} SET conversation_id = 'main' "
            "WHERE conversation_id IS NULL OR TRIM(conversation_id) = ''"
        )
    conn.execute(
        """
        INSERT OR IGNORE INTO chat_conversations(
          id, title, created_at, updated_at
        )
        SELECT conversation_id,
               '',
               COALESCE(NULLIF(MIN(created_at), ''), datetime('now')),
               COALESCE(NULLIF(MAX(created_at), ''), datetime('now'))
          FROM (
            SELECT conversation_id, created_at FROM chat_messages
            UNION ALL
            SELECT conversation_id, created_at FROM chat_ui_events
          )
         GROUP BY conversation_id
        """
    )


def apply(conn: sqlite3.Connection) -> None:
    for statement in TABLE_STATEMENTS:
        conn.execute(statement)
    _add_missing_columns(conn)
    _backfill_conversations(conn)
    for statement in INDEX_STATEMENTS:
        conn.execute(statement)


__all__ = ["SCHEMA_SQL", "VERSION", "apply"]
