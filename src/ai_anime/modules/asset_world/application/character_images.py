"""Character and identity image mutation use cases."""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path
from typing import Any

from ai_anime.modules.asset_world.application.errors import (
    CharacterIdentityNotFound,
    CharacterNotFound,
)
from ai_anime.modules.asset_world.application.ports import (
    CharacterImageFiles,
    CharacterImageRepository,
    CharacterImageUpload,
)
from ai_anime.modules.asset_world.domain.character_assets import (
    find_character_identity,
)

AssetUrl = Callable[[str | Path], str]


class CharacterImageUseCases:
    def __init__(self, files: CharacterImageFiles) -> None:
        self._files = files

    async def upload_character_portrait(
        self,
        *,
        repository: CharacterImageRepository,
        project_dir: Path,
        character_name: str,
        upload: CharacterImageUpload,
        asset_url: AssetUrl,
    ) -> dict[str, str]:
        self._character(repository, character_name)
        target = self._files.save_character_portrait(
            project_dir,
            character_name,
            await upload.read(),
        )
        return {"portrait_url": asset_url(target)}

    async def upload_identity_image(
        self,
        *,
        repository: CharacterImageRepository,
        project_dir: Path,
        character_name: str,
        identity_name: str,
        upload: CharacterImageUpload,
        asset_url: AssetUrl,
    ) -> dict[str, str]:
        self._character(repository, character_name)
        target = self._files.save_identity_image(
            project_dir,
            character_name,
            identity_name,
            await upload.read(),
        )
        return {"image_url": asset_url(target)}

    async def delete_identity_image(
        self,
        *,
        repository: CharacterImageRepository,
        project_dir: Path,
        character_name: str,
        identity_id: str,
    ) -> dict[str, bool]:
        character = repository.get_character(character_name)
        if character is None:
            raise ValueError(f"角色 {character_name} 不存在")
        identity = find_character_identity(character, identity_id)
        if identity is None:
            raise ValueError(f"身份 {identity_id} 不存在")
        deleted = self._files.delete_identity_image(
            project_dir,
            character_name,
            identity.identity_name,
        )
        return {"deleted": deleted}

    async def upload_identity_costume(
        self,
        *,
        repository: CharacterImageRepository,
        project_dir: Path,
        character_name: str,
        identity_id: str,
        upload: CharacterImageUpload,
        asset_url: AssetUrl,
    ) -> dict[str, str]:
        identity = self._identity(repository, character_name, identity_id)
        target = self._files.save_identity_costume(
            project_dir,
            character_name,
            identity.identity_name,
            await upload.read(),
        )
        await repository.update_character_identity(
            character_name,
            identity_id,
            costume_image=str(target),
        )
        return {"costume_image_url": asset_url(target)}

    async def delete_identity_costume(
        self,
        *,
        repository: CharacterImageRepository,
        project_dir: Path,
        character_name: str,
        identity_id: str,
    ) -> dict[str, bool]:
        identity = self._identity(repository, character_name, identity_id)
        deleted = self._files.delete_identity_costume(
            project_dir,
            character_name,
            identity.identity_name,
            str(getattr(identity, "costume_image", "") or ""),
        )
        await repository.update_character_identity(
            character_name,
            identity_id,
            costume_image="",
        )
        if hasattr(identity, "costume_image"):
            identity.costume_image = ""
        return {"deleted": deleted}

    async def upload_identity_portrait(
        self,
        *,
        repository: CharacterImageRepository,
        project_dir: Path,
        character_name: str,
        identity_id: str,
        upload: CharacterImageUpload,
        asset_url: AssetUrl,
    ) -> dict[str, str]:
        identity = self._identity(repository, character_name, identity_id)
        target = self._files.save_identity_portrait(
            project_dir,
            character_name,
            identity.identity_name,
            await upload.read(),
        )
        await repository.update_character_identity(
            character_name,
            identity_id,
            portrait_image=str(target),
        )
        return {"portrait_image_url": asset_url(target)}

    @staticmethod
    def _character(
        repository: CharacterImageRepository,
        character_name: str,
    ) -> Any:
        character = repository.get_character(character_name)
        if character is None:
            raise CharacterNotFound(f"Character '{character_name}' not found")
        return character

    @classmethod
    def _identity(
        cls,
        repository: CharacterImageRepository,
        character_name: str,
        identity_id: str,
    ) -> Any:
        character = cls._character(repository, character_name)
        identity = find_character_identity(character, identity_id)
        if identity is None:
            raise CharacterIdentityNotFound(f"Identity '{identity_id}' not found")
        return identity
