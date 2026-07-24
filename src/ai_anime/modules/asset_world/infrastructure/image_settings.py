"""Adapters for project image settings and request usage."""

from __future__ import annotations

from pathlib import Path

from ai_anime.config import (
    character_image_selection_options,
    get_character_image_selection,
    image_generation_selection_options,
    normalize_character_image_selection,
    normalize_image_generation_selection,
)
from ai_anime.image_request_usage import get_image_usage_summary
from ai_anime.project_config import (
    load_project_config_file,
    update_project_config_file,
)


class ConfiguredImageSelectionCatalog:
    def character_options(self) -> dict[str, str]:
        return character_image_selection_options()

    def asset_options(self) -> dict[str, str]:
        return image_generation_selection_options()

    def normalize_character_selection(self, value: str) -> str:
        return normalize_character_image_selection(value)

    def normalize_asset_selection(self, value: str) -> str:
        return normalize_image_generation_selection(value)

    def default_character_selection(self) -> str:
        return get_character_image_selection()


class ProjectConfigImageSelectionStore:
    def get(self, username: str, project: str, key: str) -> str:
        value = load_project_config_file(username, project).get(key)
        return str(value or "")

    def set(self, username: str, project: str, key: str, value: str) -> None:
        def apply(config: dict) -> None:
            config[key] = value

        update_project_config_file(username, project, apply)


class SqliteImageUsageReader:
    def summary(
        self,
        project_output_dir: str | Path,
        *,
        task_types: tuple[str, ...],
    ) -> dict:
        return get_image_usage_summary(
            project_output_dir=project_output_dir,
            task_types=task_types,
        )
