"""Atomic file replacement with explicit durability options."""

from __future__ import annotations

import os
import tempfile
from pathlib import Path


def replace_text_atomically(
    path: Path,
    content: str,
    *,
    sync_file: bool,
    sync_directory: bool,
) -> None:
    """Replace *path* atomically after writing a sibling temporary file."""

    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{path.name}.",
        suffix=".tmp",
        dir=path.parent,
    )
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            handle.write(content)
            if sync_file:
                handle.flush()
                os.fsync(handle.fileno())
        os.replace(temporary, path)
        if sync_directory:
            _sync_directory(path.parent)
    finally:
        temporary.unlink(missing_ok=True)


def replace_bytes_atomically(
    path: Path,
    content: bytes,
    *,
    sync_file: bool,
    sync_directory: bool,
) -> None:
    """Replace *path* atomically with binary *content*."""

    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{path.name}.",
        suffix=".tmp",
        dir=path.parent,
    )
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(content)
            if sync_file:
                handle.flush()
                os.fsync(handle.fileno())
        os.replace(temporary, path)
        if sync_directory:
            _sync_directory(path.parent)
    finally:
        temporary.unlink(missing_ok=True)


def _sync_directory(directory: Path) -> None:
    try:
        descriptor = os.open(str(directory), os.O_RDONLY)
    except OSError:
        return
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


__all__ = ["replace_bytes_atomically", "replace_text_atomically"]
