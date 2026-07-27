"""Configured video generation adapters."""

from __future__ import annotations

from typing import Any
from ai_anime.modules.creative_canvas.domain.video_generation import (
    default_seedance2_scene_optimize,
    is_seedance2_value_video_backend,
    normalize_seedance2_scene_optimize,
    normalize_video_aspect_ratio,
    normalize_video_resolution_for_backend,
    video_resolution_options,
)

LEGACY_VIDEO_BACKEND_ALIASES: dict[str, str] = {
    "huimeng_seedance20_fast": "newapi_seedance-2.0-fast",
    "huimeng_seedance-2.0-fast": "newapi_seedance-2.0-fast",
    "seedance_2": "newapi_seedance-2.0-fast",
    "huimeng_seedance10_fast": "newapi_seedance-1.0-pro-fast",
    "huimeng_seedance-1.0-pro-fast": "newapi_seedance-1.0-pro-fast",
    "seedance_fast": "newapi_seedance-1.0-pro-fast",
    "huimeng_seedance15_pro": "newapi_seedance-1.5-pro",
    "huimeng_seedance-1.5-pro": "newapi_seedance-1.5-pro",
    "seedance_pro": "newapi_seedance-1.5-pro",
    "seedance_pro_silent": "newapi_seedance-1.5-pro",
}
LEGACY_VIDEO_LABEL_ALIASES: dict[str, str] = {
    "huimeng seedance 2.0 fast": "newapi_seedance-2.0-fast",
    "huimeng seedance 1.0 pro fast": "newapi_seedance-1.0-pro-fast",
    "huimeng seedance 1.5 pro": "newapi_seedance-1.5-pro",
    "seedance 1.0 fast": "newapi_seedance-1.0-pro-fast",
    "seedance 1.5 有声": "newapi_seedance-1.5-pro",
    "seedance 1.5 无声": "newapi_seedance-1.5-pro",
}
DEFAULT_VIDEO_BACKEND = "newapi_seedance-2.0-fast"
NEWAPI_VIDEO_BACKENDS = {
    "newapi_seedance-2.0",
    "newapi_seedance-2.0-fast",
    "newapi_seedance-2.0-value",
    "newapi_seedance-2.0-fast-value",
    "newapi_seedance-1.0-pro-fast",
    "newapi_seedance-1.5-pro",
    "newapi_happyhorse-1.0",
}
DISABLED_VIDEO_BACKENDS = {"newapi_grok-video-channel"}


class ConfiguredCreativeCanvasVideoModelPolicy:
    def model_options(self) -> list[dict[str, Any]]:
        data: list[dict[str, Any]] = []
        for backend, label in self._newapi_options().items():
            duration_bounds = self.duration_bounds(backend)
            item = {
                "id": backend,
                "providerId": "newapi",
                "provider": "newapi",
                "apiModel": backend,
                "api_model": backend,
                "label": label,
                "backend": backend,
                "resolutionOptions": list(video_resolution_options(backend)),
                "resolution_options": list(video_resolution_options(backend)),
                "minDuration": duration_bounds[0],
                "min_duration": duration_bounds[0],
                "maxDuration": duration_bounds[1],
                "max_duration": duration_bounds[1],
            }
            if is_seedance2_value_video_backend(backend):
                default_scene = default_seedance2_scene_optimize(backend)
                item.update(
                    {
                        "sceneOptimizeOptions": ["anime", "realistic"],
                        "scene_optimize_options": ["anime", "realistic"],
                        "defaultSceneOptimize": default_scene,
                        "default_scene_optimize": default_scene,
                    }
                )
            data.append(item)
        return data

    def model_names(self) -> list[str]:
        return list(self._newapi_options())

    def resolve_backend(self, model: str | None) -> str:
        from ai_anime.generators.video_generator import parse_newapi_video_backend

        text = str(model or "").strip()
        options = self._newapi_options()
        if not text:
            return (
                DEFAULT_VIDEO_BACKEND
                if DEFAULT_VIDEO_BACKEND in options
                else next(iter(options))
            )
        if text in options:
            return text
        if text in DISABLED_VIDEO_BACKENDS:
            raise ValueError(f"unknown video model: {text}")

        folded = text.casefold()
        for backend, label in options.items():
            if label.casefold() == folded:
                return backend

        alias = LEGACY_VIDEO_BACKEND_ALIASES.get(text)
        if alias:
            return alias
        label_alias = LEGACY_VIDEO_LABEL_ALIASES.get(folded)
        if label_alias:
            return label_alias
        if parse_newapi_video_backend(text) and text not in DISABLED_VIDEO_BACKENDS:
            return text
        raise ValueError(f"unknown video model: {text}")

    def is_seedance2_backend(self, backend: str | None) -> bool:
        if str(backend or "").strip() == "seedance_2":
            return True

        from ai_anime.generators.huimengi import parse_huimeng_video_backend
        from ai_anime.generators.video_generator import parse_newapi_video_backend

        model = parse_newapi_video_backend(backend) or parse_huimeng_video_backend(
            backend
        )
        return bool(model and model.startswith("seedance-2.0"))

    def is_happyhorse_backend(self, backend: str | None) -> bool:
        from ai_anime.generators.video_generator import parse_newapi_video_backend

        model = parse_newapi_video_backend(backend) or self._model_from_backend(backend)
        return model == "happyhorse-1.0"

    def normalize_aspect_ratio(self, value: str | None) -> str:
        return normalize_video_aspect_ratio(value)

    def normalize_resolution(self, backend: str | None, value: str | None) -> str:
        return normalize_video_resolution_for_backend(backend, value)

    def normalize_duration(self, backend: str | None, value: int | None) -> int:
        try:
            duration = int(value or 5)
        except (TypeError, ValueError):
            duration = 5
        duration = max(duration, 1)
        min_duration, max_duration = self.duration_bounds(backend)
        if min_duration is not None:
            duration = max(duration, min_duration)
        if max_duration is not None:
            duration = min(duration, max_duration)
        return duration

    def normalize_scene_optimize(self, backend: str | None, value: str | None) -> str:
        return normalize_seedance2_scene_optimize(backend, value)

    def duration_bounds(self, backend: str | None) -> tuple[int | None, int | None]:
        from ai_anime.config import NEWAPI_VIDEO_DURATION_BOUNDS
        from ai_anime.generators.video_generator import (
            NewApiVideoGenerator,
            parse_newapi_video_backend,
        )

        model = parse_newapi_video_backend(backend) or self._model_from_backend(backend)
        bounds = NewApiVideoGenerator._parse_duration_bounds_config(
            NEWAPI_VIDEO_DURATION_BOUNDS
        ).get(model)
        if bounds:
            return bounds
        if model == "grok-video-channel":
            return (6, 30)
        if model == "happyhorse-1.0":
            return (3, 15)
        return (None, None)

    @staticmethod
    def _model_from_backend(backend: str | None) -> str:
        text = str(backend or "").strip().lower()
        for prefix in ("newapi_", "huimeng_", "huimengi_"):
            if text.startswith(prefix):
                return text[len(prefix) :].strip()
        return text

    @staticmethod
    def _newapi_options() -> dict[str, str]:
        from ai_anime.generators.video_generator import newapi_video_backend_options

        options = {
            key: value
            for key, value in newapi_video_backend_options().items()
            if key in NEWAPI_VIDEO_BACKENDS
        }
        options.setdefault("newapi_happyhorse-1.0", "HappyHorse 1.0")
        if DEFAULT_VIDEO_BACKEND not in options:
            return options
        ordered = {DEFAULT_VIDEO_BACKEND: options[DEFAULT_VIDEO_BACKEND]}
        ordered.update(
            (key, value)
            for key, value in options.items()
            if key != DEFAULT_VIDEO_BACKEND
        )
        return ordered
