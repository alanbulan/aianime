"""Character identity application use cases."""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path
from typing import Any

from ai_anime.modules.asset_world.application.character_catalog import (
    character_asset_links,
)
from ai_anime.modules.asset_world.application.character_voice import (
    identity_voice_fields,
)
from ai_anime.modules.asset_world.application.dto import (
    CreateIdentityCommand,
    ImportCharacterIdentityAssetCommand,
    UpdateIdentityCommand,
)
from ai_anime.modules.asset_world.application.errors import (
    CharacterNotFound,
    InvalidCharacterInput,
)
from ai_anime.modules.asset_world.application.ports import (
    CharacterIdentityAssetImporter,
    CharacterIdentityAssets,
    CharacterIdentityFactory,
    CharacterIdentityRepository,
)
from ai_anime.modules.asset_world.domain.character_identity import identity_id_for
from ai_anime.modules.project_workspace.public import ProjectContext

AssetUrl = Callable[[str | Path], str]


class CharacterIdentityUseCases:
    def __init__(
        self,
        factory: CharacterIdentityFactory,
        assets: CharacterIdentityAssets,
        asset_importer: CharacterIdentityAssetImporter,
    ) -> None:
        self._factory = factory
        self._assets = assets
        self._asset_importer = asset_importer

    def list_identities(
        self,
        *,
        repository: CharacterIdentityRepository,
        character_name: str,
        project_dir: Path,
        asset_project: str,
        asset_url: AssetUrl,
    ) -> list[dict[str, Any]]:
        character = next(
            (
                candidate
                for candidate in repository.get_all_characters()
                if candidate.name == character_name
            ),
            None,
        )
        if character is None:
            raise CharacterNotFound(f"Character '{character_name}' not found")

        return [
            self._project_identity(
                character,
                identity,
                project_dir=project_dir,
                asset_project=asset_project,
                asset_url=asset_url,
            )
            for identity in getattr(character, "identities", [])
        ]

    async def create_identity(
        self,
        *,
        repository: CharacterIdentityRepository,
        character_name: str,
        command: CreateIdentityCommand,
    ) -> dict[str, Any]:
        if repository.get_character(character_name) is None:
            raise CharacterNotFound(f"Character '{character_name}' not found")

        identity_id = identity_id_for(character_name, command.identity_name)
        identity = self._factory.create(character_name, command)
        await repository.add_character_identity(character_name, identity)
        return {
            "identity_id": identity_id,
            "identity_name": command.identity_name,
            "age_group": command.age_group,
            "appearance_details": command.appearance_details,
        }

    async def import_asset(
        self,
        *,
        context: ProjectContext,
        project_dir: Path,
        command: ImportCharacterIdentityAssetCommand,
    ) -> dict[str, Any]:
        character_name = command.character_name.strip()
        identity_name = command.identity_name.strip()
        if not character_name:
            raise InvalidCharacterInput("character is required")
        if not identity_name:
            raise InvalidCharacterInput("identity_name is required")

        identity = self._factory.create(
            character_name,
            CreateIdentityCommand(
                identity_name=identity_name,
                age_group=command.age_group.strip(),
                appearance_details=command.appearance_details.strip(),
                face_prompt=command.face_prompt.strip(),
                source="freezone",
            ),
        )
        imported = await self._asset_importer.import_asset(
            context=context,
            project_dir=project_dir,
            source_url=command.source_url,
            character_name=character_name,
            identity=identity,
        )
        return {
            "character": character_name,
            "identity_id": identity.identity_id,
            "identity_name": identity.identity_name,
            "target_path": str(imported.target_path),
            "target_url": imported.target_url,
        }

    async def update_identity(
        self,
        *,
        repository: CharacterIdentityRepository,
        character_name: str,
        identity_id: str,
        command: UpdateIdentityCommand,
    ) -> dict[str, Any]:
        if repository.get_character(character_name) is None:
            raise CharacterNotFound(f"Character '{character_name}' not found")

        updates = dict(command.fields)
        if not updates:
            return {"message": "No fields to update"}
        await repository.update_character_identity(
            character_name,
            identity_id,
            **updates,
        )
        return {
            "identity_id": identity_id,
            "updated_fields": list(updates),
        }

    async def delete_identity(
        self,
        *,
        repository: CharacterIdentityRepository,
        character_name: str,
        identity_id: str,
    ) -> dict[str, Any]:
        if repository.get_character(character_name) is None:
            raise CharacterNotFound(f"Character '{character_name}' not found")
        await repository.delete_character_identity(character_name, identity_id)
        return {"identity_id": identity_id, "message": "身份已删除"}

    def _project_identity(
        self,
        character: Any,
        identity: Any,
        *,
        project_dir: Path,
        asset_project: str,
        asset_url: AssetUrl,
    ) -> dict[str, Any]:
        identity_name = getattr(identity, "identity_name", "")
        paths = self._assets.paths(
            project_dir,
            character.name,
            identity_name,
        )
        identity_id = getattr(identity, "identity_id", "")
        item = {
            "identity_id": identity_id,
            "identity_name": identity_name,
            "appearance_details": getattr(identity, "appearance_details", ""),
            "face_prompt": getattr(identity, "face_prompt", ""),
            "age_group": getattr(identity, "age_group", ""),
            "body_type": getattr(identity, "body_type", ""),
            "image_path": paths.image,
            "image_url": asset_url(paths.image) if paths.image else "",
            "costume_image_path": paths.costume,
            "costume_image_url": asset_url(paths.costume) if paths.costume else "",
            "portrait_image_path": paths.portrait,
            "portrait_image_url": asset_url(paths.portrait) if paths.portrait else "",
            "updated_at": self._assets.updated_at(
                character,
                identity,
                paths,
            ),
        }
        item.update(
            character_asset_links(
                project=asset_project,
                character_name=character.name,
                kind="identity",
                identity_id=identity_id,
            )
        )
        item["costume_history_url"] = character_asset_links(
            project=asset_project,
            character_name=character.name,
            kind="identity_costume",
            identity_id=identity_id,
        )["history_url"]
        item["portrait_history_url"] = character_asset_links(
            project=asset_project,
            character_name=character.name,
            kind="identity_portrait",
            identity_id=identity_id,
        )["history_url"]
        item.update(
            identity_voice_fields(
                identity,
                media_url=lambda path: asset_url(project_dir / path),
            )
        )
        return item
