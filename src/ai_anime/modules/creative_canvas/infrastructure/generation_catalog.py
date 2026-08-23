"""Configured generation catalog adapter."""

from __future__ import annotations

import os
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
        asset_base = (
            os.environ.get("STYLE_GALLERY_ASSET_BASE", "").strip().rstrip("/")
            or "/style-gallery"
        )
        templates = creative_canvas_image_style_templates()
        return [
            {
                **item,
                "cover_url": f"{asset_base}/{item['cover'].lstrip('/')}",
                "sample_urls": [
                    f"{asset_base}/{sample.lstrip('/')}"
                    for sample in item.get("samples", [])
                ],
            }
            for item in templates
        ]

    def video_camera_templates(self) -> list[dict[str, Any]]:
        return get_video_camera_templates()
