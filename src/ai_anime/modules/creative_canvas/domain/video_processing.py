"""Creative Canvas video processing rules."""

from __future__ import annotations

from typing import Literal

CreativeCanvasVideoEraseMode = Literal["smart_subtitle", "box"]

CREATIVE_CANVAS_VIDEO_RESOLUTIONS: dict[str, tuple[int, int]] = {
    "720p": (1280, 720),
    "1080p": (1920, 1080),
}

CREATIVE_CANVAS_VIDEO_UPSCALE_LONG_EDGE: dict[str, int] = {
    "1080p": 1920,
    "2k": 2560,
    "4k": 3840,
}


class InvalidCreativeCanvasVideoComposition(ValueError):
    pass


def build_creative_canvas_video_upscale_filter(
    resolution: str,
    denoise_strength: str,
) -> str:
    target = CREATIVE_CANVAS_VIDEO_UPSCALE_LONG_EDGE.get(resolution.lower())
    if not target:
        raise ValueError(f"unsupported video upscale resolution: {resolution}")
    filters = [
        f"scale='if(gte(iw,ih),{target},-2)':'if(gte(iw,ih),-2,{target})':flags=lanczos"
    ]
    denoise = (denoise_strength or "1x").lower()
    if denoise == "1x":
        filters.append("hqdn3d=1.2:1.2:4:4")
    elif denoise == "2x":
        filters.append("hqdn3d=2.0:2.0:6:6")
    elif denoise != "none":
        raise ValueError(f"unsupported denoise_strength: {denoise_strength}")
    filters.append("unsharp=5:5:0.55:3:3:0.25")
    filters.append("format=yuv420p")
    return ",".join(filters)


def validate_video_erase_box(
    mode: CreativeCanvasVideoEraseMode,
    *,
    box_x: float | None,
    box_y: float | None,
    box_width: float | None,
    box_height: float | None,
) -> None:
    if mode == "box" and None in (box_x, box_y, box_width, box_height):
        raise ValueError(
            "box mode requires box_x, box_y, box_width and box_height"
        )


def validate_video_composition_track_count(track_count: int) -> None:
    if track_count <= 0:
        raise InvalidCreativeCanvasVideoComposition("tracks is required")


def validate_video_composition_source_range(
    item_id: str,
    source_start: float,
    source_end: float,
) -> None:
    if source_end <= source_start:
        raise InvalidCreativeCanvasVideoComposition(
            f"compose item {item_id} has invalid source range: "
            "source_end must be > source_start"
        )


def validate_video_composition_media_item_count(item_count: int) -> None:
    if item_count <= 0:
        raise InvalidCreativeCanvasVideoComposition(
            "tracks must contain at least one media item"
        )


def validate_video_composition_video_item_count(item_count: int) -> None:
    if item_count <= 0:
        raise InvalidCreativeCanvasVideoComposition(
            "video compose requires at least one video item"
        )
