"""Persist per-message model-context policy."""

from __future__ import annotations

import sqlite3

VERSION = "2_message_context_state"


def _column_names(conn: sqlite3.Connection, table: str) -> set[str]:
    return {
        str(row[1])
        for row in conn.execute(f"PRAGMA table_info({table})").fetchall()
    }


def apply(conn: sqlite3.Connection) -> None:
    message_columns = _column_names(conn, "chat_messages")
    if "context_state" not in message_columns:
        conn.execute(
            "ALTER TABLE chat_messages "
            "ADD COLUMN context_state TEXT NOT NULL DEFAULT 'normal'"
        )

    conversation_columns = _column_names(conn, "chat_conversations")
    if "context_revision" not in conversation_columns:
        conn.execute(
            "ALTER TABLE chat_conversations "
            "ADD COLUMN context_revision INTEGER NOT NULL DEFAULT 0"
        )
    if "context_rebuild_required" not in conversation_columns:
        conn.execute(
            "ALTER TABLE chat_conversations "
            "ADD COLUMN context_rebuild_required INTEGER NOT NULL DEFAULT 0"
        )

    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_context
          ON chat_messages(conversation_id, context_state, id)
        """
    )


__all__ = ["VERSION", "apply"]
