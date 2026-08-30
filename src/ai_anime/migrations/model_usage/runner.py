"""Synchronous migration runner for project-local model-usage tables."""

from __future__ import annotations

import sqlite3

from ai_anime.migrations.sqlite import run_sqlite_migrations

from .versions.v20260823_000_initial_usage_tables import VERSION, apply

MIGRATIONS = ((VERSION, apply),)
MIGRATION_VERSION = len(MIGRATIONS)


def run_model_usage_migrations(conn: sqlite3.Connection) -> None:
    run_sqlite_migrations(conn, MIGRATIONS)


__all__ = ["MIGRATIONS", "MIGRATION_VERSION", "run_model_usage_migrations"]
