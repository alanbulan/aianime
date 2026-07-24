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


class ConfiguredProductionImageSelections:
    def options(self) -> dict[str, str]:
        from ai_anime.config import image_generation_selection_options

        return image_generation_selection_options()

    def normalize_render(self, value: str | None) -> str:
        from ai_anime.config import (
            DEFAULT_RENDER_IMAGE_SELECTION,
            normalize_image_generation_selection,
        )

        return normalize_image_generation_selection(
            value,
            fallback=DEFAULT_RENDER_IMAGE_SELECTION,
        )

    def normalize_sketch(self, value: str | None) -> str:
        from ai_anime.config import (
            DEFAULT_SKETCH_IMAGE_SELECTION,
            normalize_image_generation_selection,
        )

        return normalize_image_generation_selection(
            value,
            fallback=DEFAULT_SKETCH_IMAGE_SELECTION,
        )
