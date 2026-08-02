"""Configured generation catalog adapter."""

from __future__ import annotations

from typing import Any

from ai_anime.modules.creative_canvas.domain.image_prompts import (
    creative_canvas_image_camera_options,
    creative_canvas_image_style_templates,
)
from ai_anime.modules.creative_canvas.domain.video_generation import (
    get_video_camera_templates,
)


class ConfiguredGenerationCatalogSource:
    def image_camera_options(self) -> dict[str, Any]:
        return creative_canvas_image_camera_options()

    def image_style_templates(self) -> list[dict[str, Any]]:
        return creative_canvas_image_style_templates()

    def video_camera_templates(self) -> list[dict[str, Any]]:
        return get_video_camera_templates()
