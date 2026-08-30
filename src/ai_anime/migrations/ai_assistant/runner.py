"""Synchronous migration runner for scoped chat databases."""

from __future__ import annotations

import sqlite3

from ai_anime.migrations.sqlite import run_sqlite_migrations

from .versions.v1_initial_chat_history import VERSION, apply
from .versions.v2_message_context_state import (
    VERSION as MESSAGE_CONTEXT_VERSION,
    apply as apply_message_context,
)

MIGRATIONS = (
    (VERSION, apply),
    (MESSAGE_CONTEXT_VERSION, apply_message_context),
)
MIGRATION_VERSION = len(MIGRATIONS)


def run_chat_history_migrations(conn: sqlite3.Connection) -> None:
    run_sqlite_migrations(conn, MIGRATIONS)


__all__ = ["MIGRATIONS", "MIGRATION_VERSION", "run_chat_history_migrations"]
