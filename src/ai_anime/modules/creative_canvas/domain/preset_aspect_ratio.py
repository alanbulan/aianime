"""Image aspect-ratio rules for Creative Canvas presets."""

from __future__ import annotations

import math
from typing import Any


CREATIVE_CANVAS_PRESET_IMAGE_ASPECT_RATIOS = (
    "1:1",
    "16:9",
    "9:16",
    "4:3",
    "3:4",
    "3:2",
    "2:3",
    "4:5",
    "5:4",
    "21:9",
)


def parse_preset_aspect_ratio(value: str) -> float | None:
    try:
        left, right = str(value or "").split(":", 1)
        width = float(left)
        height = float(right)
    except (TypeError, ValueError):
        return None
    if width <= 0 or height <= 0:
        return None
    return width / height


def nearest_preset_image_aspect_ratio(
    value: str,
    fallback: str = "1:1",
) -> str:
    if value in CREATIVE_CANVAS_PRESET_IMAGE_ASPECT_RATIOS:
        return value
    actual = parse_preset_aspect_ratio(value)
    if actual is None:
        return fallback

    def distance(candidate: str) -> float:
        candidate_value = parse_preset_aspect_ratio(candidate)
        if candidate_value is None:
            return float("inf")
        return abs(math.log(actual / candidate_value))

    return min(CREATIVE_CANVAS_PRESET_IMAGE_ASPECT_RATIOS, key=distance)


def normalize_preset_image_aspect_ratio(
    value: Any,
    fallback: str = "2:3",
) -> str:
    ratio = str(value or "").strip().replace("-", ":")
    if not ratio:
        return fallback
    if parse_preset_aspect_ratio(ratio) is None:
        return fallback
    return nearest_preset_image_aspect_ratio(ratio, fallback=fallback)


def project_preset_sketch_aspect_ratio(
    project_config: dict[str, Any] | None,
    episode: Any,
    fallback: str = "2:3",
) -> str:
    config = project_config or {}
    ep_key = str(episode or "").strip()
    by_episode = config.get("sketch_aspect_ratio_by_episode") or {}
    if isinstance(by_episode, dict) and ep_key:
        value = by_episode.get(ep_key)
        if value is None:
            try:
                value = by_episode.get(int(ep_key))
            except ValueError:
                value = None
        ratio = normalize_preset_image_aspect_ratio(value, fallback="")
        if ratio:
            return ratio
    for key in ("sketch_aspect_ratio", "aspect_ratio"):
        ratio = normalize_preset_image_aspect_ratio(config.get(key), fallback="")
        if ratio:
            return ratio
    return fallback


def context_preset_sketch_aspect_ratio(
    context: dict[str, Any],
    fallback: str = "2:3",
) -> str:
    return normalize_preset_image_aspect_ratio(
        context.get("sketch_aspect_ratio"),
        fallback=fallback,
    )
