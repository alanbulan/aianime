"""Local adapters for character identities."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from ai_anime.models import CharacterIdentity
from ai_anime.modules.asset_world.application.dto import (
    CreateIdentityCommand,
    IdentityAssetPaths,
)
from ai_anime.modules.asset_world.domain.character_identity import identity_id_for
from ai_anime.modules.asset_world.infrastructure.asset_metadata import (
    newest_updated_at,
    tree_updated_at,
)
from ai_anime.utils.path_resolver import (
    compute_identity_costume_path,
    compute_identity_path,
    compute_identity_portrait_path,
)


class PydanticCharacterIdentityFactory:
    def create(
        self,
        character_name: str,
        command: CreateIdentityCommand,
    ) -> CharacterIdentity:
        return CharacterIdentity(
            identity_id=identity_id_for(character_name, command.identity_name),
            character_name=character_name,
            identity_name=command.identity_name,
            age_group=command.age_group,
            appearance_details=command.appearance_details,
            source="api",
        )


class LocalCharacterIdentityAssets:
    def paths(
        self,
        project_dir: Path,
        character_name: str,
        identity_name: str,
    ) -> IdentityAssetPaths:
        if not identity_name:
            return IdentityAssetPaths()
        return IdentityAssetPaths(
            image=compute_identity_path(
                project_dir,
                character_name,
                identity_name,
            ),
            costume=compute_identity_costume_path(
                project_dir,
                character_name,
                identity_name,
            ),
            portrait=compute_identity_portrait_path(
                project_dir,
                character_name,
                identity_name,
            ),
        )

    def updated_at(
        self,
        character: Any,
        identity: Any,
        paths: IdentityAssetPaths,
    ) -> str:
        return newest_updated_at(
            getattr(identity, "updated_at", ""),
            getattr(character, "updated_at", ""),
            tree_updated_at(paths.image),
            tree_updated_at(paths.costume),
            tree_updated_at(paths.portrait),
        )
