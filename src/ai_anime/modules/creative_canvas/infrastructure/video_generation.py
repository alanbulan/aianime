"""Commercial video-model policy for Creative Canvas."""

from __future__ import annotations

from ai_anime.modules.creative_canvas.domain.video_generation import (
    normalize_video_aspect_ratio,
    normalize_video_resolution,
)


class ConfiguredCreativeCanvasVideoModelPolicy:
    def resolve_model(self, model: str | None) -> str:
        resolved = str(model or "").strip()
        if not resolved:
            raise ValueError("video model is required")
        return resolved

    def normalize_aspect_ratio(self, value: str | None) -> str:
        return normalize_video_aspect_ratio(value)

    def normalize_resolution(self, model: str | None, value: str | None) -> str:
        del model
        return normalize_video_resolution(value)

    def normalize_duration(self, model: str | None, value: int | None) -> int:
        del model
        try:
            return max(1, int(value or 5))
        except (TypeError, ValueError):
            return 5

    def normalize_scene_optimize(
        self,
        model: str | None,
        value: str | None,
    ) -> str:
        del model
        normalized = str(value or "").strip().lower()
        return normalized if normalized in {"anime", "realistic"} else ""
