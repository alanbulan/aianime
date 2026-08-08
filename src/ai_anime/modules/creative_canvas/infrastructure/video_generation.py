"""Commercial video-model policy for Creative Canvas."""

from __future__ import annotations

import logging

from ai_anime.modules.asset_world.public import probe_voice_sample_duration_seconds
from ai_anime.modules.model_usage.public import runtime_model_capability
from ai_anime.modules.creative_canvas.domain.video_generation import (
    MAX_OMNI_REFERENCE_AUDIO_SECONDS,
    MAX_OMNI_REFERENCE_AUDIO_TOTAL_SECONDS,
    MIN_OMNI_REFERENCE_AUDIO_SECONDS,
    normalize_video_aspect_ratio,
    normalize_video_resolution,
)
from ai_anime.shared.utils.async_ops import call_blocking

from .media_process import probe_video_duration

logger = logging.getLogger(__name__)


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

        configured_min = capability.reference_audio_min_seconds if capability else None
        configured_max = capability.reference_audio_max_seconds if capability else None
        configured_total_min = (
            capability.reference_audio_total_min_seconds if capability else None
        )
        configured_total_max = (
            capability.reference_audio_total_max_seconds if capability else None
        )
        normalized = str(model or "").strip().lower()
        if normalized.startswith("seedance-2.0"):
            return (
                max(
                    configured_min or MIN_OMNI_REFERENCE_AUDIO_SECONDS,
                    MIN_OMNI_REFERENCE_AUDIO_SECONDS,
                ),
                min(
                    configured_max or MAX_OMNI_REFERENCE_AUDIO_SECONDS,
                    MAX_OMNI_REFERENCE_AUDIO_SECONDS,
                ),
                configured_total_min,
                min(
                    configured_total_max or MAX_OMNI_REFERENCE_AUDIO_TOTAL_SECONDS,
                    MAX_OMNI_REFERENCE_AUDIO_TOTAL_SECONDS,
                ),
            )
        return (
            configured_min,
            configured_max,
            configured_total_min,
            configured_total_max,
        )
