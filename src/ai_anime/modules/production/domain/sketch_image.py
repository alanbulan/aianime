"""Sketch image editing rules."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class SketchCropRectangle:
    x: int
    y: int
    width: int
    height: int


@dataclass(frozen=True)
class SketchCropBounds:
    left: int
    top: int
    right: int
    bottom: int

    @property
    def width(self) -> int:
        return self.right - self.left

    @property
    def height(self) -> int:
        return self.bottom - self.top


def normalize_sketch_crop(
    x: Any,
    y: Any,
    width: Any,
    height: Any,
) -> SketchCropRectangle:
    try:
        rectangle = SketchCropRectangle(
            x=int(x),
            y=int(y),
            width=int(width),
            height=int(height),
        )
    except (TypeError, ValueError) as exc:
        raise ValueError("裁剪参数无效") from exc
    if rectangle.width <= 0 or rectangle.height <= 0:
        raise ValueError("裁剪宽高必须大于 0")
    return rectangle


def fit_sketch_crop(
    rectangle: SketchCropRectangle,
    image_size: tuple[int, int],
) -> SketchCropBounds:
    image_width, image_height = image_size
    left = max(0, min(rectangle.x, image_width - 1))
    top = max(0, min(rectangle.y, image_height - 1))
    return SketchCropBounds(
        left=left,
        top=top,
        right=min(left + rectangle.width, image_width),
        bottom=min(top + rectangle.height, image_height),
    )
