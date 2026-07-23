"""Local filesystem adapter for character asset history."""

from __future__ import annotations

import re
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any

from ai_anime.modules.asset_world.application.dto import (
    CharacterAssetHistoryEntry,
    CharacterAssetTarget,
)
from ai_anime.modules.asset_world.domain.character_assets import (
    ensure_character_asset_kind,
    find_character_identity,
)
from ai_anime.utils.path_resolver import (
    canonical_identity_costume_path,
    canonical_identity_path,
    canonical_identity_portrait_path,
    canonical_portrait_path,
)


def backup_character_asset(path: Path) -> Path | None:
    if not path.exists():
        return None
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S%f")
    backup = path.with_name(f"{path.stem}_{timestamp}{path.suffix}")
    shutil.copy2(path, backup)
    return backup


def _history_id_for_path(target: Path, path: Path) -> str:
    history_dir = target.parent / "_history"
    try:
        relative = path.relative_to(history_dir)
    except ValueError:
        return path.name
    return f"_history/{relative.as_posix()}"


class LocalCharacterAssetHistoryFiles:
    def resolve_target(
        self,
        *,
        project_dir: Path,
        character: Any,
        kind: str,
        identity_id: str,
    ) -> CharacterAssetTarget:
        ensure_character_asset_kind(kind)
        if kind == "portrait":
            return CharacterAssetTarget(
                path=canonical_portrait_path(project_dir, character.name)
            )

        identity = find_character_identity(character, identity_id)
        if identity is None:
            raise ValueError(f"Identity '{identity_id}' not found")
        identity_name = getattr(identity, "identity_name", "") or identity_id
        if kind == "identity":
            path = canonical_identity_path(
                project_dir,
                character.name,
                identity_name,
            )
        elif kind == "identity_costume":
            path = canonical_identity_costume_path(
                project_dir,
                character.name,
                identity_name,
            )
        else:
            path = canonical_identity_portrait_path(
                project_dir,
                character.name,
                identity_name,
            )
        return CharacterAssetTarget(path=path, identity=identity)

    def list_entries(self, target: Path) -> list[CharacterAssetHistoryEntry]:
        entries: list[CharacterAssetHistoryEntry] = []
        if target.parent.exists():
            timestamped = re.compile(
                rf"^{re.escape(target.stem)}_(?P<stamp>\d{{14,20}})"
                rf"{re.escape(target.suffix)}$"
            )
            for path in target.parent.glob(f"{target.stem}_*{target.suffix}"):
                if path.is_file() and timestamped.match(path.name):
                    entries.append(self._entry(target, path))

        history_dir = target.parent / "_history"
        if history_dir.exists():
            for path in history_dir.glob(f"{target.name}.*.bak"):
                if path.is_file():
                    entries.append(self._entry(target, path))

        entries.sort(key=lambda entry: entry.created_at, reverse=True)
        return entries

    def resolve_source(self, target: Path, history_id: str) -> Path:
        raw = str(history_id or "").strip()
        if not raw:
            raise ValueError("history_id is required")
        if raw.startswith("_history/"):
            name = raw.removeprefix("_history/")
            if "/" in name or "\\" in name:
                raise ValueError("invalid history_id")
            return target.parent / "_history" / name
        if "/" in raw or "\\" in raw:
            raise ValueError("invalid history_id")
        return target.parent / raw

    @staticmethod
    def is_file(path: Path) -> bool:
        return path.exists() and path.is_file()

    @staticmethod
    def restore(source: Path, target: Path) -> Path | None:
        target.parent.mkdir(parents=True, exist_ok=True)
        backup = backup_character_asset(target)
        shutil.copy2(source, target)
        return backup

    @staticmethod
    def _entry(target: Path, path: Path) -> CharacterAssetHistoryEntry:
        stat = path.stat()
        return CharacterAssetHistoryEntry(
            history_id=_history_id_for_path(target, path),
            filename=path.name,
            path=path,
            created_at=datetime.fromtimestamp(stat.st_mtime).isoformat(),
            bytes=stat.st_size,
        )
