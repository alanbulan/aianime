"""Creative Canvas video processing rules."""

from __future__ import annotations

from typing import Literal

CreativeCanvasVideoEraseMode = Literal["smart_subtitle", "box"]


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
