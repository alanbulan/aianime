"""Path-safe naming rules for character, scene, and prop assets."""

from __future__ import annotations

import logging
import re
import shutil
from pathlib import Path

logger = logging.getLogger(__name__)

_PATH_HOSTILE_RUN = re.compile(r"[/\\]+")
_CHARACTER_HOSTILE_RUN = re.compile(r'[/\\:*?"<>|]+')
_DOT_ONLY = re.compile(r"\A\.+\Z")
_REPLACEMENT = "_"


def _hostile_run(kind: str) -> re.Pattern[str]:
    return _CHARACTER_HOSTILE_RUN if kind == "character" else _PATH_HOSTILE_RUN


def is_path_safe_asset_name(name: str | None, *, kind: str = "asset") -> bool:
    value = str(name or "")
    return _DOT_ONLY.match(value) is None and _hostile_run(kind).search(value) is None


def path_safe_asset_name(name: str | None, *, kind: str = "asset") -> str:
    value = _hostile_run(kind).sub(_REPLACEMENT, str(name or ""))
    if _DOT_ONLY.match(value):
        return _REPLACEMENT * len(value)
    return value


def coerce_path_safe_asset_name(
    name: str | None,
    aliases: list[str] | None = None,
    *,
    kind: str = "asset",
) -> tuple[str, list[str]]:
    original = str(name or "")
    merged = [str(alias or "") for alias in (aliases or [])]
    safe = path_safe_asset_name(original, kind=kind)
    if safe != original and original and original not in merged:
        merged.append(original)
    return safe, merged


def unique_path_safe_asset_name(
    name: str | None,
    taken: set[str] | frozenset[str],
    *,
    kind: str = "asset",
) -> str:
    safe = path_safe_asset_name(name, kind=kind)
    if not safe or safe not in taken:
        return safe
    for suffix in range(2, 1000):
        candidate = f"{safe}_{suffix}"
        if candidate not in taken:
            return candidate
    return safe


def asset_dir_within(root: Path, name: str | None) -> Path | None:
    value = str(name or "")
    if not value:
        return None
    try:
        root_resolved = Path(root).resolve()
        candidate = (root_resolved / value).resolve()
    except OSError:
        return None
    if candidate == root_resolved or not candidate.is_relative_to(root_resolved):
        return None
    return candidate


def move_asset_dir(root: Path, old_name: str, new_name: str) -> bool:
    old_dir = asset_dir_within(root, old_name)
    new_dir = asset_dir_within(root, new_name)
    if old_dir is None or new_dir is None:
        logger.warning(
            "Asset name escaped its asset root; skipped directory move: %s -> %s (%s)",
            old_name,
            new_name,
            root,
        )
        return False
    if not old_dir.exists():
        return False
    if new_dir.exists():
        raise ValueError(f"Target asset directory already exists: {new_dir}")
    new_dir.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(old_dir), str(new_dir))
    return True


__all__ = [
    "asset_dir_within",
    "coerce_path_safe_asset_name",
    "is_path_safe_asset_name",
    "move_asset_dir",
    "path_safe_asset_name",
    "unique_path_safe_asset_name",
]
