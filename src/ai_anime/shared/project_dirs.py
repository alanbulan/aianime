"""Shared project directory conventions for CE and EE registries."""

from __future__ import annotations

from pathlib import Path

from ai_anime.shared.runtime_paths import OUTPUT_DIR, RUNTIME_DIR, STATE_DIR


def default_project_dirs(owner_username: str, project_name: str) -> tuple[str, str, str]:
    return (
        str((Path(OUTPUT_DIR) / owner_username / project_name).resolve()),
        str((Path(STATE_DIR) / owner_username / project_name).resolve()),
        str((Path(RUNTIME_DIR) / owner_username / project_name).resolve()),
    )
