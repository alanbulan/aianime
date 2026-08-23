"""Focused checks for coordinated SQLite schema initialization."""

from __future__ import annotations

import sqlite3
import threading
from concurrent.futures import ThreadPoolExecutor

import pytest

from ai_anime.migrations.sqlite import ensure_sqlite_schema


def test_concurrent_schema_initialization_runs_migration_once(tmp_path):
    db_path = tmp_path / "data.db"
    calls = 0
    calls_lock = threading.Lock()

    def initialize(conn: sqlite3.Connection) -> None:
        nonlocal calls
        with calls_lock:
            calls += 1
        conn.execute("CREATE TABLE coordinated_test (id INTEGER PRIMARY KEY)")

    def ensure() -> None:
        ensure_sqlite_schema(
            db_path,
            component="coordination_test",
            version=1,
            initialize=initialize,
        )

    with ThreadPoolExecutor(max_workers=8) as executor:
        list(executor.map(lambda _index: ensure(), range(16)))

    assert calls == 1
    with sqlite3.connect(db_path) as conn:
        marker = conn.execute(
            "SELECT version FROM ai_anime_schema_components "
            "WHERE component = 'coordination_test'"
        ).fetchone()
        journal_mode = conn.execute("PRAGMA journal_mode").fetchone()
    assert marker == (1,)
    assert journal_mode == ("wal",)


@pytest.mark.asyncio
async def test_shared_verification_databases_use_coordinated_schema(tmp_path):
    from ai_anime.modules.verification.infrastructure.global_registry_db import (
        open_defs_db,
    )
    from ai_anime.modules.verification.infrastructure.training_db import (
        open_training_db,
    )

    defs_path = tmp_path / "verification.db"
    training_path = tmp_path / "director_training.db"
    defs_db = await open_defs_db(defs_path)
    training_db = await open_training_db(training_path)
    try:
        async with defs_db.execute(
            "SELECT version FROM ai_anime_schema_components "
            "WHERE component = 'verification_registry'"
        ) as cursor:
            assert tuple(await cursor.fetchone()) == (1,)
        async with training_db.execute(
            "SELECT version FROM ai_anime_schema_components "
            "WHERE component = 'verification_training'"
        ) as cursor:
            assert tuple(await cursor.fetchone()) == (1,)
    finally:
        await defs_db.close()
        await training_db.close()
