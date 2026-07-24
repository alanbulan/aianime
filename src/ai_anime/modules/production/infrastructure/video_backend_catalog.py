"""Configured video backend catalog source."""

from __future__ import annotations

from ai_anime import config
from ai_anime.generators.video_generator import (
    NewApiVideoGenerator,
    newapi_video_backend_options,
    parse_newapi_video_backend,
)


class ConfiguredVideoBackendSource:
    def options(self) -> dict[str, str]:
        return newapi_video_backend_options(include_seedance2_variants=True)

    def model(self, video_backend: str) -> str | None:
        return parse_newapi_video_backend(video_backend)

    def duration_bounds(self) -> dict[str, tuple[int, int]]:
        return NewApiVideoGenerator._parse_duration_bounds_config(
            config.NEWAPI_VIDEO_DURATION_BOUNDS
        )
