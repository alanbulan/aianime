"""Synchronous character and identity image generation use cases."""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path

from ai_anime.modules.asset_world.application.character_lookup import (
    require_character,
    require_identity,
)
from ai_anime.modules.asset_world.application.dto import CharacterGenerationOptions
from ai_anime.modules.asset_world.application.errors import (
    CharacterImageGenerationRejected,
)
from ai_anime.modules.asset_world.application.ports import (
    CharacterGenerationGateway,
    CharacterGenerationRepository,
)

AssetUrl = Callable[[str | Path], str]
GenerationOptions = Callable[[], CharacterGenerationOptions]


class CharacterGenerationUseCases:
    def __init__(self, gateway: CharacterGenerationGateway) -> None:
        self._gateway = gateway

    async def generate_character_portrait(
        self,
        *,
        repository: CharacterGenerationRepository,
        project_dir: Path,
        output_dir: str | Path,
        character_name: str,
        options: GenerationOptions,
        asset_url: AssetUrl,
    ) -> dict[str, str]:
        character = require_character(repository, character_name)
        target = await self._gateway.generate_character_portrait(
            character=character,
            project_dir=project_dir,
            output_dir=output_dir,
            options=options(),
        )
        if target is None:
            raise CharacterImageGenerationRejected("Portrait generation failed")
        return {"portrait_url": asset_url(target)}

    async def generate_identity_portrait(
        self,
        *,
        repository: CharacterGenerationRepository,
        project_dir: Path,
        character_name: str,
        identity_id: str,
        options: GenerationOptions,
        asset_url: AssetUrl,
    ) -> dict[str, str]:
        character = require_character(repository, character_name)
        identity = require_identity(character, identity_id)
        if not getattr(identity, "face_prompt", ""):
            raise CharacterImageGenerationRejected(
                "该身份无 face_prompt，无需独立 Portrait"
            )
        target = await self._gateway.generate_identity_portrait(
            character=character,
            identity=identity,
            project_dir=project_dir,
            options=options(),
        )
        if target is None:
            raise CharacterImageGenerationRejected("身份 Portrait 生成失败")
        await repository.update_character_identity(
            character_name,
            identity_id,
            portrait_image=str(target),
        )
        return {"portrait_image_url": asset_url(target)}

    async def generate_identity_image(
        self,
        *,
        repository: CharacterGenerationRepository,
        project_dir: Path,
        character_name: str,
        identity_id: str,
        options: GenerationOptions,
        asset_url: AssetUrl,
    ) -> dict[str, str]:
        character = require_character(repository, character_name)
        identity = require_identity(character, identity_id)
        assets = self._gateway.resolve_identity_assets(
            character=character,
            identity=identity,
            project_dir=project_dir,
        )
        appearance_details = getattr(identity, "appearance_details", "") or ""
        face_prompt = getattr(identity, "face_prompt", "") or ""
        if not appearance_details and not face_prompt and not assets.has_costume_image:
            raise CharacterImageGenerationRejected(
                "Identity has no appearance_details, face_prompt, or costume_image"
            )

        output_path = self._gateway.prepare_identity_image_output(
            character=character,
            identity=identity,
            project_dir=project_dir,
        )
        generation_options = options()
        identity_age = getattr(identity, "age_group", "") or ""
        character_age = getattr(character, "age_group", "youth") or "youth"
        is_age_variant = bool(identity_age and identity_age != character_age)
        if is_age_variant:
            identity_prompt = self._age_variant_prompt(
                appearance_details=appearance_details,
                face_prompt=face_prompt,
                has_costume_image=assets.has_costume_image,
                has_identity_portrait=assets.has_identity_portrait,
            )
            reference_image_path = (
                assets.identity_portrait if assets.has_identity_portrait else ""
            )
        else:
            if not assets.character_portrait:
                raise CharacterImageGenerationRejected(
                    f"Character '{character_name}' has no portrait. Generate portrait first"
                )
            identity_prompt = "" if assets.has_costume_image else appearance_details
            reference_image_path = assets.character_portrait

        result = await self._gateway.generate_identity_image(
            character=character,
            identity=identity,
            project_dir=project_dir,
            output_path=output_path,
            identity_prompt=identity_prompt,
            reference_image_path=reference_image_path,
            costume_image_path=(
                assets.costume_image if assets.has_costume_image else ""
            ),
            options=generation_options,
            usage_scope=(
                f"character:{character_name}:identity:{identity.identity_name}"
            ),
        )
        if isinstance(result, bool):
            success = result
            error_message = "Identity image generation failed"
        else:
            success = bool(result.get("success", False))
            error_message = result.get(
                "error",
                "Identity image generation failed",
            )
        if not success:
            raise CharacterImageGenerationRejected(str(error_message))
        return {"image_url": asset_url(output_path)}

    @staticmethod
    def _age_variant_prompt(
        *,
        appearance_details: str,
        face_prompt: str,
        has_costume_image: bool,
        has_identity_portrait: bool,
    ) -> str:
        if has_identity_portrait and has_costume_image:
            return ""
        if has_identity_portrait:
            return appearance_details
        if has_costume_image:
            return face_prompt
        if appearance_details:
            return f"{face_prompt}\n{appearance_details}"
        return face_prompt
