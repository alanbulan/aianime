"""Video-model capability and request-normalization rules."""

from __future__ import annotations

import math
from collections.abc import Iterable

DEFAULT_VIDEO_RESOLUTION_OPTIONS = ("480p", "720p")
VIDEO_WORKFLOW_STANDARD = "standard"
VIDEO_WORKFLOW_ADVANCED_REFERENCE = "advanced-reference"
VIDEO_WORKFLOW_REFERENCE = "reference"


def uses_advanced_reference_video_workflow(workflow: str | None) -> bool:
    return str(workflow or "").strip().lower() == VIDEO_WORKFLOW_ADVANCED_REFERENCE


def uses_reference_video_workflow(workflow: str | None) -> bool:
    return str(workflow or "").strip().lower() == VIDEO_WORKFLOW_REFERENCE


def normalize_video_generation_duration(
    *values: float | int | None,
    minimum_seconds: float | None = None,
    maximum_seconds: float | None = None,
    duration_options: Iterable[float] = (),
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
    minimum_integer: int | None = None
    if minimum_seconds is not None:
        minimum = float(minimum_seconds)
        if math.isfinite(minimum) and minimum > 0:
            minimum_integer = int(math.ceil(minimum))
            target = max(target, minimum_integer)

    maximum_integer: int | None = None
    if maximum_seconds is not None:
        maximum = float(maximum_seconds)
        if math.isfinite(maximum) and maximum > 0:
            maximum_integer = int(math.floor(maximum))
            if target > maximum_integer:
                raise ValueError(
                    f"视频目标时长 {target} 秒超过所选模型支持的最大时长 "
                    f"{maximum:g} 秒"
                )

    options: list[int] = []
    for option in duration_options:
        try:
            seconds = float(option)
        except (TypeError, ValueError):
            continue
        if not math.isfinite(seconds) or seconds <= 0:
            continue
        if not seconds.is_integer():
            raise ValueError("视频模型的时长选项必须是正整数秒")
        options.append(int(seconds))
    declared_options = sorted(set(options))
    options = [
        option
        for option in declared_options
        if (minimum_integer is None or option >= minimum_integer)
        and (maximum_integer is None or option <= maximum_integer)
    ]
    if declared_options and not options:
        raise ValueError("视频模型的时长选项与最小/最大时长范围不一致")
    if options:
        supported = [option for option in options if option >= target]
        if not supported:
            raise ValueError(
                f"视频目标时长 {target} 秒超过所选模型可用时长选项的最大值 "
                f"{options[-1]} 秒"
            )
        target = supported[0]
    return target


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
    return DEFAULT_VIDEO_RESOLUTION_OPTIONS


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


def normalize_video_ratio(
    ratio: str | None,
    declared_options: Iterable[str] | None = None,
) -> str:
    options = tuple(
        dict.fromkeys(
            normalized
            for raw in declared_options or ()
            if (
                normalized := str(raw or "").strip().lower()
            ) == "auto"
            or (
                ":" in normalized
                and all(part.isdigit() and int(part) > 0 for part in normalized.split(":", 1))
            )
        )
    )
    value = str(ratio or "").strip()
    if options:
        return value if value in options else options[0]
    return value or "16:9"


def validate_video_resolution_duration(
    resolution: str,
    duration: float | int | None,
    resolution_max_seconds: Iterable[tuple[str, float]] | None = None,
) -> None:
    limits = {
        str(key or "").strip().lower(): float(value)
        for key, value in resolution_max_seconds or ()
        if str(key or "").strip() and float(value) > 0
    }
    maximum = limits.get(str(resolution or "").strip().lower())
    if maximum is None:
        return
    try:
        duration_seconds = float(duration) if duration is not None else 0.0
    except (TypeError, ValueError):
        duration_seconds = 0.0
    if duration_seconds > maximum:
        raise ValueError(
            f"所选分辨率 {resolution} 最多支持 {maximum:g} 秒视频；"
            "请缩短时长或选择其他分辨率"
        )
