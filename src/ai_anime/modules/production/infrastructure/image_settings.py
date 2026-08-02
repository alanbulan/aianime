"""Configured adapters for Production image settings."""

from __future__ import annotations

from typing import Any


class ProjectConfigProductionSettings:
    def load(self, username: str, project: str) -> dict[str, Any]:
        from ai_anime.project_config import load_project_config

        return load_project_config(username, project)

    def save(
        self,
        username: str,
        project: str,
        updates: dict[str, Any],
    ) -> None:
        from ai_anime.project_config import save_project_config

        save_project_config(username, project, config=updates)


class ExplicitProductionImageModelPolicy:
    def normalize(self, value: str | None) -> str:
        return str(value or "").strip()
