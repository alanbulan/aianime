"""Configured generation catalog adapter."""

from __future__ import annotations

from typing import Any

from ai_anime.config import (
    IMAGE_GENERATION_SELECTIONS,
    image_generation_selection_options,
)
from ai_anime.freezone.route_helpers import (
    get_freezone_image_camera_options,
    get_freezone_image_style_templates,
)
from ai_anime.freezone.video_node import (
    get_freezone_video_model_options,
    get_video_camera_templates,
)


class ConfiguredGenerationCatalogSource:
    def image_camera_options(self) -> dict[str, Any]:
        return get_freezone_image_camera_options()

    def image_style_templates(self) -> list[dict[str, Any]]:
        return get_freezone_image_style_templates()

    def image_models(self) -> list[dict[str, Any]]:
        options = image_generation_selection_options()
        models: list[dict[str, Any]] = []
        for key, label in options.items():
            entry = IMAGE_GENERATION_SELECTIONS.get(key, {})
            models.append(
                {
                    "id": key,
                    "providerId": entry.get("provider", "newapi"),
                    "provider": entry.get("provider", "newapi"),
                    "apiModel": key,
                    "api_model": key,
                    "label": label,
                }
            )
        return models

    def video_camera_templates(self) -> list[dict[str, Any]]:
        return get_video_camera_templates()

    def video_models(self) -> list[dict[str, Any]]:
        return get_freezone_video_model_options()
