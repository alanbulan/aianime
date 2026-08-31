"""State-backed JSON sidecar helpers for generated media indexes."""

from __future__ import annotations

import json
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

import portalocker

from ai_anime.shared.runtime_paths import OUTPUT_DIR, STATE_DIR
from ai_anime.shared.utils.atomic_files import replace_text_atomically


def _under(path: Path, root: Path) -> Path | None:
    try:
        return path.resolve().relative_to(root.resolve())
    except ValueError:
        return None


def _sibling_state_path(path: Path, filename: str) -> Path | None:
    parts = path.resolve().parts
    try:
        output_index = max(index for index, part in enumerate(parts) if part == "output")
    except ValueError:
        return None
    if output_index >= len(parts) - 1:
        return None
    return Path(*parts[:output_index], "state", *parts[output_index + 1 :]) / filename


def resolve_state_index_path(episode_dir: str | Path, filename: str) -> Path:
    """Map an output episode directory to its state-backed index path.

    Temp/test directories that are not under a known ``output`` root keep a
    colocated sidecar path so fixture-style tests remain self-contained.
    """
    directory = Path(episode_dir)
    state_root = Path(STATE_DIR)

    state_rel = _under(directory, state_root)
    if state_rel is not None:
        return state_root / state_rel / filename

    output_rel = _under(directory, Path(OUTPUT_DIR))
    if output_rel is not None:
        return state_root / output_rel / filename

    sibling = _sibling_state_path(directory, filename)
    if sibling is not None:
        return sibling

    return directory / filename


@contextmanager
def index_file_lock(index_path: Path) -> Iterator[None]:
    lock_path = index_path.with_suffix(f"{index_path.suffix}.lock")
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    with open(lock_path, "a+", encoding="utf-8") as lock_file:
        portalocker.lock(lock_file, portalocker.LOCK_EX)
        try:
            yield
        finally:
            portalocker.unlock(lock_file)


def write_json_atomic(index_path: Path, payload: dict[str, Any]) -> None:
    replace_text_atomically(
        index_path,
        json.dumps(payload, ensure_ascii=False, indent=2),
        sync_file=True,
        sync_directory=False,
    )
