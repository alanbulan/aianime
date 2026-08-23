"""Remove secrets left by the retired local model-gateway settings."""

from __future__ import annotations

import sqlite3
from pathlib import Path

from ai_anime.migrations.sqlite import ensure_sqlite_schema
from ai_anime.shared.runtime_paths import STATE_DIR

VERSION = "20260823_001_purge_legacy_gateway_secrets"


def migrate_legacy_gateway_secrets() -> None:
    path = Path(STATE_DIR) / "local" / "settings.db"
    if not path.is_file():
        return

    def initialize(connection: sqlite3.Connection) -> None:
        table = connection.execute(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
            ("runtime_settings",),
        ).fetchone()
        if table is None:
            return

        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version TEXT PRIMARY KEY,
                applied_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
            """
        )
        connection.commit()
        applied = connection.execute(
            "SELECT 1 FROM schema_migrations WHERE version = ?",
            (VERSION,),
        ).fetchone()
        if applied is not None:
            return

        connection.execute("BEGIN IMMEDIATE")
        connection.execute(
            """
            DELETE FROM runtime_settings
            WHERE key = 'model_gateway_mode'
               OR key LIKE 'official_newapi_%'
               OR key LIKE 'custom_newapi_%'
               OR key = 'media_relay_provider'
               OR key = 'media_relay_ttl_seconds'
               OR key LIKE 'oss_relay_%'
               OR key LIKE 'cloudinary_relay_%'
               OR key = 'model_access_v2_migrated'
            """
        )
        connection.execute(
            "INSERT INTO schema_migrations(version) VALUES (?)",
            (VERSION,),
        )

    ensure_sqlite_schema(
        path,
        component="legacy_gateway_secret_purge",
        version=1,
        initialize=initialize,
    )


__all__ = ["VERSION", "migrate_legacy_gateway_secrets"]
