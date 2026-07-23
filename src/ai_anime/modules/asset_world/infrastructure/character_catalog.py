"""Local adapters for the character catalog."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from ai_anime.models import NovelCharacter
from ai_anime.modules.asset_world.application.dto import CreateCharacterCommand
from ai_anime.modules.asset_world.infrastructure.asset_metadata import (
    newest_updated_at,
    tree_updated_at,
)
from ai_anime.utils.path_resolver import compute_portrait_path


class NovelCharacterFactory:
    def create(self, command: CreateCharacterCommand) -> NovelCharacter:
        return NovelCharacter(
            name=command.name,
            role=command.role,
            is_main=command.is_main,
            gender=command.gender,
            age_group=command.age_group,
            description=command.description,
            face_prompt=command.face_prompt,
        )


class LocalCharacterCatalogAssets:
    def portrait_path(self, project_dir: Path, character_name: str) -> str:
        return compute_portrait_path(project_dir, character_name)

    def updated_at(self, project_dir: Path, character: Any) -> str:
        return newest_updated_at(
            getattr(character, "updated_at", ""),
            tree_updated_at(project_dir / "assets" / "characters" / character.name),
        )
