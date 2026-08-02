"""Exclusive file locks for Creative Canvas documents."""

from __future__ import annotations

import time
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

import portalocker

from ai_anime.modules.creative_canvas.domain.canvas_identity import (
    require_creative_canvas_id,
)
from ai_anime.modules.creative_canvas.infrastructure.paths import canvases_dir


class CanvasLockBusy(RuntimeError):
    def __init__(self, canvas_id: str) -> None:
        super().__init__(f"canvas lock busy: {canvas_id}")
        self.canvas_id = canvas_id


def canvas_locks_dir(project_dir: Path) -> Path:
    return canvases_dir(project_dir) / "_locks"


def canvas_lock_path(project_dir: Path, canvas_id: str) -> Path:
    require_creative_canvas_id(canvas_id)
    return canvas_locks_dir(project_dir) / f"{canvas_id}.lock"


@contextmanager
def canvas_write_lock(
    project_dir: Path,
    canvas_id: str,
    *,
    timeout_seconds: float = 3.0,
    retry_interval_seconds: float = 0.02,
) -> Iterator[None]:
    """Acquire a short-lived exclusive lock for one canvas document."""
    path = canvas_lock_path(project_dir, canvas_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    deadline = time.monotonic() + timeout_seconds
    with path.open("a+", encoding="utf-8") as lock_file:
        while True:
            try:
                portalocker.lock(
                    lock_file,
                    portalocker.LOCK_EX | portalocker.LOCK_NB,
                )
                break
            except portalocker.exceptions.AlreadyLocked as exc:
                if time.monotonic() >= deadline:
                    raise CanvasLockBusy(canvas_id) from exc
                time.sleep(retry_interval_seconds)
        try:
            yield
        finally:
            portalocker.unlock(lock_file)
