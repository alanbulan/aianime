"""Remove settings and secrets left by retired local model-gateway storage."""

from __future__ import annotations

import sqlite3
from pathlib import Path

from ai_anime.migrations.sqlite import ensure_sqlite_schema, run_sqlite_migrations
from ai_anime.shared.runtime_paths import STATE_DIR

VERSION = "20260831_000_purge_retired_gateway_settings"


def purge_retired_gateway_settings() -> None:
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

        def purge_retired_settings(conn: sqlite3.Connection) -> None:
            conn.execute(
                """
                DELETE FROM runtime_settings
                WHERE key = 'model_gateway_mode'
                   OR key LIKE 'official_newapi_%'
                   OR key LIKE 'custom_newapi_%'
                   OR key LIKE 'official_model_gateway_%'
                   OR key LIKE 'custom_model_gateway_%'
                   OR key = 'media_relay_provider'
                   OR key = 'media_relay_ttl_seconds'
                   OR key LIKE 'oss_relay_%'
                   OR key LIKE 'cloudinary_relay_%'
                   OR key = 'model_access_v2_migrated'
                """
            )

        run_sqlite_migrations(
            connection,
            ((VERSION, purge_retired_settings),),
        )

    ensure_sqlite_schema(
        path,
        component="retired_gateway_settings_purge",
        version=2,
        initialize=initialize,
    )


__all__ = ["VERSION", "purge_retired_gateway_settings"]
