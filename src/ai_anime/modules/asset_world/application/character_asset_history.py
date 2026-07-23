"""Character asset-history application use cases."""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path
from typing import Any

from ai_anime.modules.asset_world.application.dto import (
    RestoreCharacterAssetCommand,
)
from ai_anime.modules.asset_world.application.errors import (
    CharacterAssetHistoryNotFound,
    CharacterAssetHistoryRejected,
    CharacterNotFound,
)
from ai_anime.modules.asset_world.application.ports import (
    CharacterAssetHistoryFiles,
    CharacterAssetHistoryRepository,
)

AssetUrl = Callable[[str | Path], str]


class CharacterAssetHistoryUseCases:
    def __init__(self, files: CharacterAssetHistoryFiles) -> None:
        self._files = files

    def list_history(
        self,
        *,
        repository: CharacterAssetHistoryRepository,
        character_name: str,
        project_dir: Path,
        kind: str,
        identity_id: str,
        asset_url: AssetUrl,
    ) -> dict[str, Any]:
        character = repository.get_character(character_name)
        if character is None:
            raise CharacterNotFound(f"Character '{character_name}' not found")
        try:
            target = self._files.resolve_target(
                project_dir=project_dir,
                character=character,
                kind=kind,
                identity_id=identity_id,
            )
        except ValueError as exc:
            raise CharacterAssetHistoryRejected(str(exc)) from exc

        entries = self._files.list_entries(target.path)
        return {
            "kind": kind,
            "identity_id": identity_id,
            "current_url": asset_url(target.path),
            "entries": [
                {
                    "history_id": entry.history_id,
                    "filename": entry.filename,
                    "url": asset_url(entry.path),
                    "created_at": entry.created_at,
                    "bytes": entry.bytes,
                }
                for entry in entries
            ],
        }

    async def restore_history(
        self,
        *,
        repository: CharacterAssetHistoryRepository,
        character_name: str,
        project_dir: Path,
        command: RestoreCharacterAssetCommand,
        asset_url: AssetUrl,
    ) -> dict[str, Any]:
        character = repository.get_character(character_name)
        if character is None:
            raise CharacterNotFound(f"Character '{character_name}' not found")
        try:
            target = self._files.resolve_target(
                project_dir=project_dir,
                character=character,
                kind=command.kind,
                identity_id=command.identity_id,
            )
        except ValueError as exc:
            raise CharacterAssetHistoryRejected(str(exc)) from exc

        allowed_ids = {
            entry.history_id for entry in self._files.list_entries(target.path)
        }
        if command.history_id not in allowed_ids:
            raise CharacterAssetHistoryNotFound("History asset not found")
        try:
            source = self._files.resolve_source(target.path, command.history_id)
        except ValueError as exc:
            raise CharacterAssetHistoryRejected(str(exc)) from exc
        if not self._files.is_file(source):
            raise CharacterAssetHistoryNotFound("History asset not found")

        backup = self._files.restore(source, target.path)
        await self._sync_identity_asset(
            repository,
            character_name=character_name,
            identity=target.identity,
            kind=command.kind,
            target=target.path,
        )
        return {
            "kind": command.kind,
            "identity_id": command.identity_id,
            "restored": True,
            "url": asset_url(target.path),
            "backup_history_id": backup.name if backup else "",
        }

    @staticmethod
    async def _sync_identity_asset(
        repository: CharacterAssetHistoryRepository,
        *,
        character_name: str,
        identity: Any | None,
        kind: str,
        target: Path,
    ) -> None:
        if identity is None:
            return
        identity_id = getattr(identity, "identity_id", "")
        if kind == "identity_costume":
            await repository.update_character_identity(
                character_name,
                identity_id,
                costume_image=str(target),
            )
        elif kind == "identity_portrait":
            await repository.update_character_identity(
                character_name,
                identity_id,
                portrait_image=str(target),
            )
