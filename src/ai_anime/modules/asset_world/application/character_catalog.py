"""Character catalog application use cases."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import replace
from pathlib import Path
from typing import Any
from urllib.parse import quote, urlencode

from ai_anime.modules.asset_world.application.character_voice import (
    character_voice_fields,
)
from ai_anime.modules.asset_world.application.dto import (
    CreateCharacterCommand,
    UpdateCharacterCommand,
)
from ai_anime.modules.asset_world.application.errors import (
    CharacterAlreadyExists,
    CharacterCatalogRejected,
    CharacterNotFound,
    InvalidCharacterInput,
)
from ai_anime.modules.asset_world.application.ports import (
    CharacterCatalogAssets,
    CharacterCatalogRepository,
    CharacterFactory,
)
from ai_anime.modules.asset_world.domain.character_catalog import (
    duplicate_main_character_names,
    other_main_character_names,
)
from ai_anime.modules.asset_world.domain.asset_names import path_safe_asset_name

AssetUrl = Callable[[str | Path], str]


def character_asset_links(
    *,
    project: str,
    character_name: str,
    kind: str,
    identity_id: str = "",
) -> dict[str, str]:
    query = {"kind": kind}
    if identity_id:
        query["identity_id"] = identity_id
    base = (
        f"/api/v1/projects/{quote(project, safe='')}/characters/"
        f"{quote(character_name, safe='')}"
    )
    return {
        "history_url": f"{base}/asset-history?{urlencode(query)}",
        "restore_url": f"{base}/asset-history/restore",
    }


class CharacterCatalogUseCases:
    def __init__(
        self,
        factory: CharacterFactory,
        assets: CharacterCatalogAssets,
    ) -> None:
        self._factory = factory
        self._assets = assets

    async def list_characters(
        self,
        *,
        repository: CharacterCatalogRepository,
        project_dir: Path,
        asset_project: str,
        asset_url: AssetUrl,
    ) -> list[dict[str, Any]]:
        characters = list(repository.get_all_characters())
        duplicates = duplicate_main_character_names(characters)
        for name in duplicates:
            await repository.update_character(name, is_main=False)
        for character in characters:
            if character.name in duplicates:
                character.is_main = False

        return [
            self._project_character(
                character,
                project_dir=project_dir,
                asset_project=asset_project,
                asset_url=asset_url,
            )
            for character in characters
        ]

    async def create_character(
        self,
        *,
        repository: CharacterCatalogRepository,
        command: CreateCharacterCommand,
    ) -> dict[str, Any]:
        name = path_safe_asset_name(command.name.strip(), kind="character")
        if not name:
            raise InvalidCharacterInput("Character name cannot be empty")
        if repository.get_character(name) is not None:
            raise CharacterAlreadyExists(f"Character '{name}' already exists")
        if command.is_main:
            await self._unset_other_main_characters(repository, name)

        character = self._factory.create(replace(command, name=name))
        await repository.add_character(character)
        return {
            field: getattr(character, field)
            for field in (
                "name",
                "role",
                "is_main",
                "gender",
                "age_group",
                "description",
                "face_prompt",
            )
        }

    async def update_character(
        self,
        *,
        repository: CharacterCatalogRepository,
        character_name: str,
        command: UpdateCharacterCommand,
    ) -> dict[str, Any]:
        if repository.get_character(character_name) is None:
            raise CharacterNotFound(f"Character '{character_name}' not found")

        updates = dict(command.fields)
        requested_name = None
        if "name" in updates:
            requested_name = path_safe_asset_name(
                str(updates.pop("name") or "").strip(),
                kind="character",
            )
            if not requested_name:
                raise InvalidCharacterInput("Character name cannot be empty")

        updated_fields: list[str] = []
        renamed_from = None
        target_name = character_name
        if requested_name and requested_name != character_name:
            if repository.get_character(requested_name) is not None:
                raise CharacterAlreadyExists(
                    f"Character '{requested_name}' already exists"
                )
            try:
                await repository.rename_character(character_name, requested_name)
            except ValueError as exc:
                raise CharacterCatalogRejected(str(exc)) from exc
            target_name = requested_name
            renamed_from = character_name
            updated_fields.append("name")

        if not updates and not updated_fields:
            return {"message": "No fields to update"}

        if updates.get("is_main") is True:
            await self._unset_other_main_characters(repository, target_name)
        if updates:
            await repository.update_character(target_name, **updates)
            updated_fields.extend(updates)

        data: dict[str, Any] = {
            "name": target_name,
            "updated_fields": updated_fields,
        }
        if renamed_from:
            data["renamed_from"] = renamed_from
        return data

    async def delete_character(
        self,
        *,
        repository: CharacterCatalogRepository,
        character_name: str,
    ) -> dict[str, Any]:
        if repository.get_character(character_name) is None:
            raise CharacterNotFound(f"Character '{character_name}' not found")
        await repository.delete_character(character_name)
        return {"name": character_name, "deleted": True}

    async def _unset_other_main_characters(
        self,
        repository: CharacterCatalogRepository,
        selected_name: str,
    ) -> None:
        for name in other_main_character_names(
            repository.get_all_characters(),
            selected_name,
        ):
            await repository.update_character(name, is_main=False)

    def _project_character(
        self,
        character: Any,
        *,
        project_dir: Path,
        asset_project: str,
        asset_url: AssetUrl,
    ) -> dict[str, Any]:
        portrait_path = self._assets.portrait_path(project_dir, character.name)
        item = {
            "name": character.name,
            "aliases": getattr(character, "aliases", []),
            "description": getattr(character, "description", ""),
            "role": getattr(character, "role", ""),
            "gender": getattr(character, "gender", ""),
            "age_group": getattr(character, "age_group", ""),
            "body_type": getattr(character, "body_type", ""),
            "face_prompt": getattr(character, "face_prompt", ""),
            "is_main": bool(getattr(character, "is_main", False)),
            "portrait_path": portrait_path,
            "portrait_url": asset_url(portrait_path) if portrait_path else "",
            "identities": [
                {
                    "identity_id": getattr(identity, "identity_id", ""),
                    "identity_name": getattr(identity, "identity_name", ""),
                }
                for identity in getattr(character, "identities", [])
            ],
            "updated_at": self._assets.updated_at(project_dir, character),
        }
        item.update(
            character_asset_links(
                project=asset_project,
                character_name=character.name,
                kind="portrait",
            )
        )
        item.update(
            character_voice_fields(
                character,
                media_url=lambda path: asset_url(project_dir / path),
            )
        )
        return item
