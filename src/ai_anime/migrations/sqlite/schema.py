"""Cross-process coordination for SQLite schema initialization.

Schema work is intentionally synchronous. Async callers must run the complete
``ensure_sqlite_schema`` call in a worker thread so waiting for the file lock
never blocks an event loop that may currently own another database connection.
"""

from __future__ import annotations

import contextlib
import sqlite3
import threading
from collections import OrderedDict
from collections.abc import Callable, Iterator
from pathlib import Path
from typing import IO

import portalocker

from ai_anime.shared.infrastructure.sqlite_pragmas import (
    configure_sqlite_connection,
)


_MAX_READY_COMPONENTS = 4096
_READY_COMPONENTS: OrderedDict[
    tuple[str, int, int, str, int], None
] = OrderedDict()
_READY_COMPONENTS_LOCK = threading.Lock()

_SCHEMA_MARKER_SQL = """
CREATE TABLE IF NOT EXISTS ai_anime_schema_components (
    component TEXT PRIMARY KEY,
    version INTEGER NOT NULL
)
"""


def schema_lock_path(db_path: str | Path) -> Path:
    path = Path(db_path)
    return path.with_name(f"{path.name}.schema.lock")


@contextlib.contextmanager
def sqlite_schema_lock(db_path: str | Path) -> Iterator[None]:
    """Serialize schema initialization for one SQLite file across processes."""

    lock_path = schema_lock_path(db_path)
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    handle: IO[str] = lock_path.open("a+", encoding="utf-8")
    try:
        portalocker.lock(handle, portalocker.LOCK_EX)
        yield
    finally:
        with contextlib.suppress(Exception):
            portalocker.unlock(handle)
        handle.close()


def _database_identity(
    db_path: str | Path,
    component: str,
    version: int,
) -> tuple[str, int, int, str, int] | None:
    path = Path(db_path).resolve()
    try:
        stat = path.stat()
    except OSError:
        return None
    return (str(path), int(stat.st_dev), int(stat.st_ino), component, version)


def schema_component_is_process_ready(
    db_path: str | Path,
    component: str,
    version: int,
) -> bool:
    identity = _database_identity(db_path, component, version)
    if identity is None:
        return False
    with _READY_COMPONENTS_LOCK:
        if identity not in _READY_COMPONENTS:
            return False
        _READY_COMPONENTS.move_to_end(identity)
        return True


def mark_schema_component_process_ready(
    db_path: str | Path,
    component: str,
    version: int,
) -> None:
    identity = _database_identity(db_path, component, version)
    if identity is None:
        return
    resolved_path = identity[0]
    with _READY_COMPONENTS_LOCK:
        stale = [
            item
            for item in _READY_COMPONENTS
            if item[0] == resolved_path
            and item[3] == component
            and item != identity
        ]
        for item in stale:
            _READY_COMPONENTS.pop(item, None)
        _READY_COMPONENTS[identity] = None
        _READY_COMPONENTS.move_to_end(identity)
        while len(_READY_COMPONENTS) > _MAX_READY_COMPONENTS:
            _READY_COMPONENTS.popitem(last=False)


def _journal_is_wal(conn: sqlite3.Connection) -> bool:
    row = conn.execute("PRAGMA journal_mode").fetchone()
    return row is not None and str(row[0]).lower() == "wal"


def _enable_wal(conn: sqlite3.Connection) -> None:
    row = conn.execute("PRAGMA journal_mode=WAL").fetchone()
    if row is None or str(row[0]).lower() != "wal":
        raise RuntimeError("failed to enable SQLite WAL mode")


def schema_component_is_current(
    conn: sqlite3.Connection,
    component: str,
    version: int,
) -> bool:
    try:
        row = conn.execute(
            "SELECT version FROM ai_anime_schema_components WHERE component = ?",
            (component,),
        ).fetchone()
    except sqlite3.OperationalError:
        return False
    return row is not None and int(row[0]) >= version


def mark_schema_component(
    conn: sqlite3.Connection,
    component: str,
    version: int,
) -> None:
    conn.execute(_SCHEMA_MARKER_SQL)
    conn.execute(
        "INSERT INTO ai_anime_schema_components(component, version) VALUES (?, ?) "
        "ON CONFLICT(component) DO UPDATE SET version = excluded.version",
        (component, version),
    )


def ensure_sqlite_schema(
    db_path: str | Path,
    *,
    component: str,
    version: int,
    initialize: Callable[[sqlite3.Connection], None],
) -> None:
    """Initialize one schema component once per DB inode and code version."""

    path = Path(db_path).resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    if schema_component_is_process_ready(path, component, version):
        return

    if path.is_file():
        probe = sqlite3.connect(path, timeout=10, check_same_thread=False)
        try:
            configure_sqlite_connection(probe, set_journal_mode=False)
            if schema_component_is_current(
                probe,
                component,
                version,
            ) and _journal_is_wal(probe):
                mark_schema_component_process_ready(path, component, version)
                return
        finally:
            probe.close()

    with sqlite_schema_lock(path):
        conn = sqlite3.connect(path, timeout=10, check_same_thread=False)
        try:
            configure_sqlite_connection(conn, set_journal_mode=False)
            if not _journal_is_wal(conn):
                _enable_wal(conn)
            if not schema_component_is_current(conn, component, version):
                initialize(conn)
                mark_schema_component(conn, component, version)
                conn.commit()
            mark_schema_component_process_ready(path, component, version)
        finally:
            conn.close()


__all__ = [
    "ensure_sqlite_schema",
    "mark_schema_component",
    "mark_schema_component_process_ready",
    "schema_component_is_current",
    "schema_component_is_process_ready",
    "schema_lock_path",
    "sqlite_schema_lock",
]
