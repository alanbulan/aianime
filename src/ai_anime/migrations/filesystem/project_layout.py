"""Migrate the legacy single project directory into output/state/runtime."""

from __future__ import annotations

import shutil
import sqlite3
from pathlib import Path
from typing import Protocol

_SQLITE_MAGIC = b"SQLite format 3\x00"
_SQLITE_SIDECAR_SUFFIXES = ("-wal", "-shm", "-journal")


class ProjectLayoutPaths(Protocol):
    LEGACY_STATE_ITEMS: tuple[str, ...]
    LEGACY_RUNTIME_ITEMS: tuple[str, ...]
    output_dir: Path
    state_dir: Path
    runtime_dir: Path

    def has_legacy_payload(self) -> bool: ...

    def ensure_dirs(self) -> None: ...


def _is_sqlite_sidecar(path: Path) -> bool:
    return any(path.name.endswith(suffix) for suffix in _SQLITE_SIDECAR_SUFFIXES)


def _is_sqlite_db(path: Path) -> bool:
    if not path.is_file() or _is_sqlite_sidecar(path):
        return False
    try:
        with path.open("rb") as file:
            return file.read(len(_SQLITE_MAGIC)) == _SQLITE_MAGIC
    except OSError:
        return False


def _copy_file(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    if _is_sqlite_db(src):
        with sqlite3.connect(src) as conn:
            conn.execute("VACUUM INTO ?", (str(dst),))
    else:
        shutil.copy2(src, dst)


def _copy_tree(src: Path, dst: Path) -> None:
    dst.mkdir(parents=True, exist_ok=True)
    for entry in src.iterdir():
        target = dst / entry.name
        if _is_sqlite_sidecar(entry):
            continue
        if entry.is_dir():
            _copy_tree(entry, target)
        elif entry.is_file() and not target.exists():
            _copy_file(entry, target)


def _copy_missing_items(
    src_root: Path,
    dst_root: Path,
    names: tuple[str, ...],
) -> None:
    for name in names:
        src = src_root / name
        dst = dst_root / name
        if not src.exists() or _is_sqlite_sidecar(src):
            continue
        try:
            if src.is_dir():
                _copy_tree(src, dst)
            elif not dst.exists():
                _copy_file(src, dst)
        except FileExistsError:
            continue


def migrate_legacy_project_layout(paths: ProjectLayoutPaths) -> None:
    marker = paths.state_dir / ".migrated"
    if marker.exists():
        return
    if not paths.has_legacy_payload():
        paths.state_dir.mkdir(parents=True, exist_ok=True)
        marker.touch()
        return
    paths.ensure_dirs()
    _copy_missing_items(
        paths.output_dir,
        paths.state_dir,
        paths.LEGACY_STATE_ITEMS,
    )
    _copy_missing_items(
        paths.output_dir,
        paths.runtime_dir,
        paths.LEGACY_RUNTIME_ITEMS,
    )
    marker.touch()


__all__ = ["migrate_legacy_project_layout"]
