"""Commercial video-model policy for Creative Canvas."""

from __future__ import annotations

import logging
from collections.abc import Mapping

from ai_anime.modules.asset_world.public import probe_voice_sample_duration_seconds
from ai_anime.modules.creative_canvas.domain.model_parameters import (
    normalize_canvas_model_parameters,
)
from ai_anime.modules.model_usage.public import runtime_model_capability
from ai_anime.shared.utils.async_ops import call_blocking

from .media_process import probe_video_duration

logger = logging.getLogger(__name__)

_LEGACY_REFERENCE_COUNT_LIMITS = (9, 3, 3, 12)


class FfprobeCreativeCanvasReferenceDurationProbe:
    async def probe_seconds(self, path: str, media_type: str) -> float | None:
        try:
            if media_type == "video":
                return float(await probe_video_duration(path))
            return float(await call_blocking(probe_voice_sample_duration_seconds, path))
        except Exception as exc:
            logger.warning(
                "creative canvas reference %s duration probe failed: %s (%s)",
                media_type,
                path,
                exc,
            )
            return None


class ConfiguredCreativeCanvasVideoModelPolicy:
    def resolve_model(self, model: str | None) -> str:
        resolved = str(model or "").strip()
        if not resolved:
            raise ValueError("video model is required")
        return resolved

    def normalize_aspect_ratio(self, model: str | None, value: str | None) -> str:
        capability = runtime_model_capability(model)
        if capability is None:
            raise ValueError("video model capability is required")
        options = capability.video_ratio_options
        if not options:
            raise ValueError("video model aspect ratio parameters are not declared")
        normalized = str(value or "").strip().lower()
        if not normalized:
            raise ValueError("video aspect ratio is required")
        if normalized not in options:
            raise ValueError(f"视频模型 {model} 不支持画面比例 {normalized}")
        return normalized

    def normalize_resolution(self, model: str | None, value: str | None) -> str:
        capability = runtime_model_capability(model)
        if capability is None:
            raise ValueError("video model capability is required")
        if not (
            capability.video_resolution_options or capability.video_size_options
        ):
            raise ValueError("video model output parameters are not declared")
        from ai_anime.modules.production.public import video_resolution

        return video_resolution(
            model,
            value,
            capability.video_resolution_options,
            capability.video_size_options,
        )

    def normalize_duration(self, model: str | None, value: int | None) -> int:
        try:
            duration = int(value)
        except (TypeError, ValueError):
            raise ValueError("video duration is required") from None
        capability = runtime_model_capability(model)
        if capability is None:
            raise ValueError("video model capability is required")
        minimum = capability.video_generation_min_seconds
        maximum = capability.video_generation_max_seconds
        options = capability.video_duration_options
        if not options and minimum is None and maximum is None:
            raise ValueError("video model duration parameters are not declared")
        from ai_anime.modules.production.public import (
            normalize_video_generation_duration,
        )

        return normalize_video_generation_duration(
            duration,
            minimum_seconds=minimum,
            maximum_seconds=maximum,
            duration_options=options,
        )

    def normalize_generate_audio(self, model: str | None, value: bool) -> bool:
        capability = runtime_model_capability(model)
        if capability is None:
            raise ValueError("video model capability is required")
        requested = bool(value)
        if requested and capability.video_supports_generate_audio is not True:
            raise ValueError(f"视频模型 {model} 不支持生成音频")
        return requested

    def normalize_human_review(self, model: str | None, value: bool) -> bool:
        capability = runtime_model_capability(model)
        if capability is None:
            raise ValueError("video model capability is required")
        requested = bool(value)
        if requested and capability.video_supports_human_review is not True:
            raise ValueError(f"视频模型 {model} 不支持真人素材审核")
        return requested

    def normalize_extra_params(
        self,
        model: str | None,
        value: Mapping[str, object] | None,
    ) -> dict[str, object]:
        capability = runtime_model_capability(model)
        if capability is None:
            raise ValueError("video model capability is required")
        return normalize_canvas_model_parameters(
            value,
            allowed_keys=frozenset(capability.video_extra_parameter_names),
        )

    def normalize_scene_optimize(
        self,
        model: str | None,
        value: str | None,
    ) -> str:
        normalized = str(value or "").strip()
        if not normalized:
            return ""
        capability = runtime_model_capability(model)
        if capability is None:
            raise ValueError("video model capability is required")
        options = capability.video_scene_optimize_options
        if not options:
            raise ValueError("video model scene optimize parameters are not declared")
        if normalized not in options:
            raise ValueError(f"视频模型 {model} 不支持场景优化参数 {normalized}")
        return normalized

    def reference_duration_limits(
        self,
        model: str | None,
        media_type: str,
    ) -> tuple[float | None, float | None, float | None, float | None]:
        capability = runtime_model_capability(model)
        if media_type == "video":
            return (
                capability.reference_video_min_seconds if capability else None,
                capability.reference_video_max_seconds if capability else None,
                capability.reference_video_total_min_seconds if capability else None,
                capability.reference_video_total_max_seconds if capability else None,
            )

        return (
            capability.reference_audio_min_seconds if capability else None,
            capability.reference_audio_max_seconds if capability else None,
            capability.reference_audio_total_min_seconds if capability else None,
            capability.reference_audio_total_max_seconds if capability else None,
        )

    def reference_count_limits(
        self,
        model: str | None,
    ) -> tuple[int | None, int | None, int | None, int | None]:
        capability = runtime_model_capability(model)
        if capability is None:
            return _LEGACY_REFERENCE_COUNT_LIMITS
        declared = (
            capability.max_reference_images,
            capability.max_reference_videos,
            capability.max_reference_audios,
            capability.max_reference_total,
        )
        return tuple(
            fallback if value is None else value
            for value, fallback in zip(
                declared,
                _LEGACY_REFERENCE_COUNT_LIMITS,
                strict=True,
            )
        )
