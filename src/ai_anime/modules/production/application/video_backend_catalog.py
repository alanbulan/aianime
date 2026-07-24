"""Video backend catalog application use cases."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from ai_anime.modules.production.application.ports import (
    ProductionVideoBackendSource,
)
from ai_anime.modules.production.domain.video_backend import (
    DEFAULT_VIDEO_BACKEND,
    GROK_VIDEO_RATIO_OPTIONS,
    GROK_VIDEO_RESOLUTION_OPTIONS,
    GROK_VIDEO_SUPPORTED_MODES,
    HAPPYHORSE_RATIO_OPTIONS,
    HAPPYHORSE_RESOLUTION_OPTIONS,
    HAPPYHORSE_SUPPORTED_MODES,
    is_grok_video_backend,
    is_happyhorse_backend,
    is_seedance2_backend,
)


@dataclass(frozen=True)
class VideoBackendOption:
    value: str
    label: str
    is_default: bool = False
    is_seedance2: bool = False
    is_happyhorse: bool = False
    is_grok_video: bool = False
    dialogue_only: bool = False
    min_duration: int | None = None
    max_duration: int | None = None
    resolution_options: tuple[str, ...] | None = None
    ratio_options: tuple[str, ...] | None = None
    supported_modes: tuple[str, ...] | None = None
    reference_image_max: int | None = None
    reference_video_max: int | None = None
    reference_audio_max: int | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "value": self.value,
            "label": self.label,
            "is_default": self.is_default,
            "is_seedance2": self.is_seedance2,
            "is_happyhorse": self.is_happyhorse,
            "is_grok_video": self.is_grok_video,
            "dialogue_only": self.dialogue_only,
            "min_duration": self.min_duration,
            "max_duration": self.max_duration,
            "resolution_options": (
                list(self.resolution_options)
                if self.resolution_options is not None
                else None
            ),
            "ratio_options": (
                list(self.ratio_options) if self.ratio_options is not None else None
            ),
            "supported_modes": (
                list(self.supported_modes)
                if self.supported_modes is not None
                else None
            ),
            "reference_image_max": self.reference_image_max,
            "reference_video_max": self.reference_video_max,
            "reference_audio_max": self.reference_audio_max,
        }


class VideoBackendCatalogUseCases:
    def __init__(self, source: ProductionVideoBackendSource) -> None:
        self._source = source

    def list_options(self) -> tuple[VideoBackendOption, ...]:
        options = dict(self._source.options())
        options.setdefault("newapi_happyhorse-1.0", "HappyHorse 1.0")
        duration_bounds = self._source.duration_bounds()

        result: list[VideoBackendOption] = []
        for value, label in options.items():
            model = self._source.model(value)
            bounds = duration_bounds.get(model or "")
            if model == "happyhorse-1.0" and not bounds:
                bounds = (3, 15)
            if model == "grok-video-channel" and not bounds:
                bounds = (6, 30)

            happyhorse = is_happyhorse_backend(value)
            grok_video = is_grok_video_backend(value)
            result.append(
                VideoBackendOption(
                    value=value,
                    label=label,
                    is_default=value == DEFAULT_VIDEO_BACKEND,
                    is_seedance2=is_seedance2_backend(value),
                    is_happyhorse=happyhorse,
                    is_grok_video=grok_video,
                    dialogue_only=value
                    in {"seedance_pro", "newapi_seedance-1.5-pro"},
                    min_duration=bounds[0] if bounds else None,
                    max_duration=bounds[1] if bounds else None,
                    resolution_options=(
                        HAPPYHORSE_RESOLUTION_OPTIONS
                        if happyhorse
                        else GROK_VIDEO_RESOLUTION_OPTIONS
                        if grok_video
                        else None
                    ),
                    ratio_options=(
                        HAPPYHORSE_RATIO_OPTIONS
                        if happyhorse
                        else GROK_VIDEO_RATIO_OPTIONS
                        if grok_video
                        else None
                    ),
                    supported_modes=(
                        HAPPYHORSE_SUPPORTED_MODES
                        if happyhorse
                        else GROK_VIDEO_SUPPORTED_MODES
                        if grok_video
                        else None
                    ),
                    reference_image_max=7 if grok_video else 9 if happyhorse else None,
                    reference_video_max=0 if grok_video else 1 if happyhorse else None,
                    reference_audio_max=0 if grok_video or happyhorse else None,
                )
            )
        return tuple(result)
