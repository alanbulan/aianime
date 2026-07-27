"""Creative Canvas video processing rules."""

from __future__ import annotations

from typing import Literal

CreativeCanvasVideoEraseMode = Literal["smart_subtitle", "box"]


class InvalidCreativeCanvasVideoComposition(ValueError):
    pass


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
