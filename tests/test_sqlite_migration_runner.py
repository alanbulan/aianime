from __future__ import annotations

import sqlite3

import pytest

from ai_anime.migrations.sqlite import run_sqlite_migrations


def test_sqlite_migration_runner_is_idempotent() -> None:
    conn = sqlite3.connect(":memory:")
    calls: list[str] = []

    def migrate(connection: sqlite3.Connection) -> None:
        calls.append("v1")
        connection.execute("CREATE TABLE migrated (id INTEGER PRIMARY KEY)")

    try:
        migrations = (("v1", migrate),)
        run_sqlite_migrations(conn, migrations)
        run_sqlite_migrations(conn, migrations)

        assert calls == ["v1"]
        assert conn.execute(
            "SELECT version FROM schema_migrations"
        ).fetchall() == [("v1",)]
    finally:
        conn.close()


def test_sqlite_migration_runner_rolls_back_failed_version() -> None:
    conn = sqlite3.connect(":memory:")

    def migrate(connection: sqlite3.Connection) -> None:
        connection.execute("CREATE TABLE not_committed (id INTEGER PRIMARY KEY)")
        raise RuntimeError("migration failed")

    try:
        with pytest.raises(RuntimeError, match="migration failed"):
            run_sqlite_migrations(conn, (("v1", migrate),))

        assert conn.execute(
            "SELECT version FROM schema_migrations"
        ).fetchall() == []
        assert conn.execute(
            "SELECT name FROM sqlite_master WHERE name = 'not_committed'"
        ).fetchall() == []
    finally:
        conn.close()
