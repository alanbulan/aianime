from __future__ import annotations

import re
from pathlib import Path

from ai_anime.shared.utils.path_resolver import safe_path_name


def safe_name(value: str) -> str:
    return safe_path_name(value)


def safe_token(value: str) -> str:
    safe = re.sub(r"[^0-9A-Za-z_\-\u4e00-\u9fff]+", "_", str(value or "").strip())
    return safe.strip("_") or "scene"


def world_path(project_dir: Path, scene_id: str) -> Path:
    return Path(project_dir) / "director_worlds" / safe_name(scene_id) / "world.json"


def blockings_dir(project_dir: Path, episode: int) -> Path:
    return Path(project_dir) / "director_blockings" / f"ep{int(episode):03d}"


def beat_blocking_path(project_dir: Path, episode: int, beat_num: int) -> Path:
    return blockings_dir(project_dir, episode) / f"beat_{int(beat_num):02d}.json"


def package_dir() -> Path:
    return Path(__file__).resolve().parent


def shape_hints_dir() -> Path:
    return package_dir() / "shape_hints"


def shape_hint_registry_path() -> Path:
    return shape_hints_dir() / "registry.json"


def states_dir() -> Path:
    return package_dir() / "states"


def actor_state_registry_path() -> Path:
    return states_dir() / "registry.json"


def session_id(user: str, project: str, episode: int, scene_id: str) -> str:
    user_part = safe_token(user or "user")
    project_part = safe_token(project or "project")
    return f"dir_{user_part}_{project_part}_ep{int(episode):03d}_{safe_token(scene_id)}"


def fs_url(path: Path) -> str:
    """Vite /@fs URL:posix 化并保证根斜杠(Windows 盘符 C:/ 前需补 /)。"""
    posix = Path(path).resolve().as_posix()
    if not posix.startswith("/"):
        posix = "/" + posix
    return f"/@fs{posix}"
