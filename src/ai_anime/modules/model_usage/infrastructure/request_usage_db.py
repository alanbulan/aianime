"""Shared project-local request-usage database access."""

from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path

from ai_anime.migrations.model_usage import (
    MIGRATION_VERSION,
    run_model_usage_migrations,
)
from ai_anime.migrations.sqlite import ensure_sqlite_schema
from ai_anime.shared.infrastructure.sqlite_pragmas import configure_sqlite_connection
from ai_anime.shared.utils.project_paths import (
    resolve_project_data_db_path as get_request_usage_db_path,
)


@contextmanager
def request_usage_connection(project_output_dir: str | Path):
    db_path = get_request_usage_db_path(project_output_dir)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    ensure_sqlite_schema(
        db_path,
        component="model_usage",
        version=MIGRATION_VERSION,
        initialize=run_model_usage_migrations,
    )
    conn = sqlite3.connect(db_path, timeout=10, check_same_thread=False)
    configure_sqlite_connection(conn, set_journal_mode=False)
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


__all__ = ["get_request_usage_db_path", "request_usage_connection"]
