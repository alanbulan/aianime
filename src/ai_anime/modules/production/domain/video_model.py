"""Video-model capability and request-normalization rules."""

from __future__ import annotations

import math
from collections.abc import Iterable

SEEDANCE2_RESOLUTION_OPTIONS_BY_MODEL = {
    "seedance-2.0-fast": ("480p", "720p"),
    "seedance-2.0": ("480p", "720p", "1080p"),
    "seedance-2.0-value": ("720p", "1080p"),
    "seedance-2.0-fast-value": ("720p", "1080p"),
    "seedance-1.5-pro": ("480p", "720p", "1080p"),
}
SEEDANCE2_DEFAULT_RESOLUTION_OPTIONS = ("480p", "720p")
HAPPYHORSE_RESOLUTION_OPTIONS = ("768p", "1080p")
HAPPYHORSE_RATIO_OPTIONS = ("16:9", "9:16", "1:1", "4:3", "3:4")
HAPPYHORSE_SUPPORTED_MODES = ("first_frame", "multimodal_reference")
GROK_VIDEO_RESOLUTION_OPTIONS = ("720p", "480p")
GROK_VIDEO_RATIO_OPTIONS = ("16:9", "9:16", "1:1", "2:3", "3:2")
GROK_VIDEO_SUPPORTED_MODES = ("first_frame", "multimodal_reference")
SEEDANCE2_DEFAULT_MIN_DURATION = 4.0


def is_seedance2_model(
    model: str | None,
    video_profile: str | None = None,
) -> bool:
    profile = str(video_profile or "").strip().lower()
    if profile:
        return profile == "seedance2"
    normalized = str(model or "").strip().lower()
    return normalized.startswith("seedance-2.0") or normalized.startswith(
        ("video-seeddance-", "video-seedance-")
    )


def normalize_video_generation_duration(
    *values: float | int | None,
    minimum_seconds: float | None = None,
    maximum_seconds: float | None = None,
) -> int:
    """Resolve one integer duration accepted by the selected video model."""

    candidates: list[int] = []
    for value in values:
        try:
            seconds = float(value) if value is not None else 0.0
        except (TypeError, ValueError):
            continue
        if math.isfinite(seconds) and seconds > 0:
            candidates.append(int(math.ceil(seconds)))

    target = max(candidates, default=1)
    if minimum_seconds is not None:
        minimum = float(minimum_seconds)
        if math.isfinite(minimum) and minimum > 0:
            target = max(target, int(math.ceil(minimum)))

    if maximum_seconds is not None:
        maximum = float(maximum_seconds)
        if math.isfinite(maximum) and maximum > 0:
            maximum_integer = int(math.floor(maximum))
            if target > maximum_integer:
                raise ValueError(
                    f"视频目标时长 {target} 秒超过所选模型支持的最大时长 "
                    f"{maximum:g} 秒"
                )
    return target


def is_happyhorse_model(model: str | None) -> bool:
    return str(model or "").strip().lower() in {"happyhorse-1.0", "happyhorse-1.1"}


def is_grok_video_model(model: str | None) -> bool:
    return str(model or "").strip().lower() == "grok-video-channel"


def video_api_resolution(resolution: str | None) -> str:
    value = str(resolution or "").strip()
    if value in {"480p", "720p", "768p", "1080p"}:
        return value
    if "x" in value.lower():
        try:
            width, height = (
                int(part) for part in value.lower().split("x", 1)
            )
            dimensions = (width, height)
            long_edge = max(dimensions)
            if 1080 in dimensions or long_edge >= 1900:
                return "1080p"
            if 768 in dimensions or long_edge >= 1330:
                return "768p"
            if 720 in dimensions or long_edge >= 1200:
                return "720p"
            if 480 in dimensions or long_edge >= 800:
                return "480p"
        except (TypeError, ValueError):
            pass
    if "480" in value:
        return "480p"
    if "768" in value:
        return "768p"
    if "1080" in value:
        return "1080p"
    return "720p"


def _declared_video_resolution(value: object) -> str | None:
    normalized = str(value or "").strip().lower()
    digits = normalized[:-1] if normalized.endswith("p") else ""
    if 2 <= len(digits) <= 5 and digits.isdigit() and int(digits) > 0:
        return normalized
    return None


def video_output_size(aspect_ratio: str | None, resolution: str | None) -> str:
    """Resolve the exact even-pixel frame size for one ratio and quality tier."""

    exact_size = _exact_video_size(resolution)
    if exact_size is not None:
        return exact_size
    ratio = str(aspect_ratio or "16:9").strip()
    quality = _declared_video_resolution(resolution) or video_api_resolution(
        resolution
    )
    dynamic_short_edge = int(quality[:-1])
    long_edge = {
        "480p": 854,
        "720p": 1280,
        "768p": 1366,
        "1080p": 1920,
    }.get(quality)
    short_edge = {"480p": 480, "720p": 720, "768p": 768, "1080p": 1080}[
        quality
    ] if quality in {"480p", "720p", "768p", "1080p"} else dynamic_short_edge
    try:
        ratio_width, ratio_height = (
            int(part) for part in ratio.split(":", 1)
        )
    except (TypeError, ValueError):
        ratio_width, ratio_height = 16, 9
    if ratio_width <= 0 or ratio_height <= 0:
        ratio_width, ratio_height = 16, 9
    if ratio_width == ratio_height:
        return f"{short_edge}x{short_edge}"
    if long_edge is None:
        long_edge = round(
            short_edge * max(ratio_width, ratio_height) / min(ratio_width, ratio_height)
        )
    if ratio_width > ratio_height:
        width = long_edge
        height = round(width * ratio_height / ratio_width)
    else:
        height = long_edge
        width = round(height * ratio_width / ratio_height)
    width += width % 2
    height += height % 2
    return f"{width}x{height}"


def video_resolution_options(
    model: str | None,
    declared_options: Iterable[str] | None = None,
) -> tuple[str, ...]:
    declared = tuple(
        dict.fromkeys(
            option
            for value in declared_options or ()
            if (option := _declared_video_resolution(value)) is not None
        )
    )
    if declared:
        return declared
    return SEEDANCE2_RESOLUTION_OPTIONS_BY_MODEL.get(
        str(model or "").strip().lower(),
        SEEDANCE2_DEFAULT_RESOLUTION_OPTIONS,
    )


def video_resolution(
    model: str | None,
    resolution: str | None,
    declared_options: Iterable[str] | None = None,
    declared_sizes: Iterable[str] | None = None,
) -> str:
    size_options = tuple(
        dict.fromkeys(
            size
            for value in declared_sizes or ()
            if (size := _exact_video_size(value)) is not None
        )
    )
    requested_size = _exact_video_size(resolution)
    if size_options:
        if requested_size is not None and requested_size in size_options:
            return requested_size
        model_label = str(model or "").strip() or "当前视频模型"
        raise ValueError(
            f"所选模型 {model_label} 不支持分辨率 {resolution}；"
            f"支持的分辨率：{', '.join(size_options)}"
        )
    options = video_resolution_options(model, declared_options)
    declared_resolution = _declared_video_resolution(resolution)
    clean_resolution = declared_resolution or video_api_resolution(resolution)
    if clean_resolution in options:
        return clean_resolution
    model_label = str(model or "").strip() or "当前视频模型"
    raise ValueError(
        f"所选模型 {model_label} 不支持分辨率 {clean_resolution}；"
        f"支持的分辨率：{', '.join(options)}"
    )


def _exact_video_size(value: object) -> str | None:
    normalized = str(value or "").strip().lower()
    parts = normalized.split("x")
    if len(parts) != 2 or not all(part.isdigit() for part in parts):
        return None
    width, height = (int(parts[0]), int(parts[1]))
    if not (64 <= width <= 8192 and 64 <= height <= 8192):
        return None
    return f"{width}x{height}"


def happyhorse_resolution(
    resolution: str | None,
    duration: float | int | None = None,
) -> str:
    raw = str(resolution or "").strip().lower()
    value = "768p"
    if any(token in raw for token in ("768", "1080")):
        value = video_api_resolution(raw)
        if value not in HAPPYHORSE_RESOLUTION_OPTIONS:
            value = "768p"
    try:
        duration_seconds = float(duration) if duration is not None else 0.0
    except (TypeError, ValueError):
        duration_seconds = 0.0
    if duration_seconds > 6 and value == "1080p":
        raise ValueError("Hailuo 2.3 的 1080p 仅支持 6 秒视频；更长视频请选择 768p")
    return value


def happyhorse_ratio(ratio: str | None) -> str:
    value = str(ratio or "").strip()
    return value if value in HAPPYHORSE_RATIO_OPTIONS else "16:9"


def grok_video_resolution(resolution: str | None) -> str:
    value = str(resolution or "").strip().lower()
    return value if value in GROK_VIDEO_RESOLUTION_OPTIONS else "720p"


def grok_video_ratio(ratio: str | None) -> str:
    value = str(ratio or "").strip()
    return value if value in GROK_VIDEO_RATIO_OPTIONS else "16:9"
