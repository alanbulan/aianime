"""Synchronous generator and filesystem adapter for character images."""

from __future__ import annotations

import shutil
from datetime import datetime
from pathlib import Path
from typing import Any

from ai_anime.modules.asset_world.application.dto import (
    CharacterGenerationOptions,
    IdentityGenerationAssets,
)
from ai_anime.modules.asset_world.infrastructure.character_image_storage import (
    backup_character_asset_by_second,
)
from ai_anime.shared.utils.path_resolver import (
    canonical_identity_path,
    canonical_identity_portrait_path,
    canonical_portrait_path,
    compute_identity_costume_path,
    compute_identity_portrait_path,
    compute_portrait_path,
)


class UnifiedSynchronousCharacterGeneration:
    async def generate_character_portrait(
        self,
        *,
        character: Any,
        project_dir: Path,
        output_dir: str | Path,
        options: CharacterGenerationOptions,
    ) -> Path | None:
        from ai_anime.modules.generators.public import (
            generate_character_reference_unified,
        )

        target = canonical_portrait_path(project_dir, character.name)
        backup_character_asset_by_second(target)
        paths = await generate_character_reference_unified(
            character_name=character.name,
            appearance_prompt=(
                character.face_prompt if hasattr(character, "face_prompt") else ""
            ),
            style=options.style,
            ethnicity=options.ethnicity,
            model=options.model,
            output_dir=output_dir,
            project_dir=str(project_dir),
        )
        if not paths:
            return None
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(paths[0], target)
        return target

    async def generate_identity_portrait(
        self,
        *,
        character: Any,
        identity: Any,
        project_dir: Path,
        options: CharacterGenerationOptions,
    ) -> Path | None:
        from ai_anime.modules.generators.public import generate_character_reference_unified

        target = canonical_identity_portrait_path(
            project_dir,
            character.name,
            identity.identity_name,
        )
        target.parent.mkdir(parents=True, exist_ok=True)
        temp_dir = target.parent / f".tmp_identity_portrait_{datetime.now():%Y%m%d%H%M%S%f}"
        temp_dir.mkdir(parents=True, exist_ok=True)
        try:
            paths = await generate_character_reference_unified(
                character_name=character.name,
                appearance_prompt=str(identity.face_prompt).strip(),
                output_dir=str(temp_dir),
                count=1,
                style=options.style,
                ethnicity=options.ethnicity,
                model=options.model,
                project_dir=str(project_dir),
                usage_task_type="character_portrait",
                usage_scope=(
                    f"character:{character.name}:identity_portrait:"
                    f"{identity.identity_name}"
                ),
                identity_name=identity.identity_name,
            )
            if not paths:
                return None
            backup_character_asset_by_second(target)
            shutil.copy(paths[0], target)
            return target
        finally:
            shutil.rmtree(temp_dir, ignore_errors=True)

    def resolve_identity_assets(
        self,
        *,
        character: Any,
        identity: Any,
        project_dir: Path,
    ) -> IdentityGenerationAssets:
        costume_image = compute_identity_costume_path(
            project_dir,
            character.name,
            identity.identity_name,
        ) or (getattr(identity, "costume_image", "") or "")
        identity_portrait = compute_identity_portrait_path(
            project_dir,
            character.name,
            identity.identity_name,
        ) or (getattr(identity, "portrait_image", "") or "")
        character_portrait = compute_portrait_path(project_dir, character.name)
        return IdentityGenerationAssets(
            costume_image=str(costume_image),
            identity_portrait=str(identity_portrait),
            character_portrait=str(character_portrait),
            has_costume_image=bool(
                costume_image and Path(costume_image).exists()
            ),
            has_identity_portrait=bool(
                identity_portrait and Path(identity_portrait).exists()
            ),
        )

    def prepare_identity_image_output(
        self,
        *,
        character: Any,
        identity: Any,
        project_dir: Path,
    ) -> Path:
        target = canonical_identity_path(
            project_dir,
            character.name,
            identity.identity_name,
        )
        target.parent.mkdir(parents=True, exist_ok=True)
        backup_character_asset_by_second(target)
        return target

    async def generate_identity_image(
        self,
        *,
        character: Any,
        identity: Any,
        project_dir: Path,
        output_path: Path,
        identity_prompt: str,
        reference_image_path: str,
        costume_image_path: str,
        options: CharacterGenerationOptions,
        usage_scope: str,
    ) -> Any:
        from ai_anime.modules.generators.public import generate_identity_image_unified

        return await generate_identity_image_unified(
            character_name=character.name,
            identity_prompt=identity_prompt,
            reference_image_path=reference_image_path,
            output_path=str(output_path),
            character_tag=getattr(identity, "character_tag", ""),
            ethnicity=options.ethnicity,
            style=options.style,
            model=options.model,
            project_dir=str(project_dir),
            costume_image_path=costume_image_path,
            usage_task_type="identity_image",
            usage_scope=usage_scope,
            identity_name=identity.identity_name,
        )
