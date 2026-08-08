"""Adapters for project image settings and request usage."""

from __future__ import annotations

from pathlib import Path

from ai_anime.modules.model_usage.public import get_image_usage_summary
from ai_anime.modules.project_workspace.public import (
    load_project_config,
    load_project_config_file,
    update_project_config_file,
)


class ProjectConfigImageSelectionStore:
    def get(self, username: str, project: str, key: str) -> str:
        value = load_project_config_file(username, project).get(key)
        return str(value or "")

    def set(self, username: str, project: str, key: str, value: str) -> None:
        def apply(config: dict) -> None:
            config[key] = value

        update_project_config_file(username, project, apply)


class ProjectConfigImageGenerationSettings:
    def effective(self, username: str, project: str) -> dict:
        return load_project_config(username, project)

    def stored(self, username: str, project: str) -> dict:
        return load_project_config_file(username, project)


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
