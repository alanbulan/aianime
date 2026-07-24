"""Sketch image editing application use cases."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ai_anime.modules.production.application.ports import SketchImageFiles
from ai_anime.modules.production.domain.sketch_image import (
    fit_sketch_crop,
    normalize_sketch_crop,
)


@dataclass(frozen=True)
class CropSketchCommand:
    x: Any
    y: Any
    width: Any
    height: Any


class SketchCropRejected(Exception):
    pass


class SketchImageUseCases:
    def __init__(self, files: SketchImageFiles) -> None:
        self._files = files

    def crop(
        self,
        *,
        sketch_path: Path,
        command: CropSketchCommand,
    ) -> dict[str, int]:
        try:
            rectangle = normalize_sketch_crop(
                command.x,
                command.y,
                command.width,
                command.height,
            )
        except ValueError as exc:
            raise SketchCropRejected(str(exc)) from exc

        bounds = fit_sketch_crop(
            rectangle,
            self._files.image_size(sketch_path),
        )
        self._files.crop(
            sketch_path,
            (bounds.left, bounds.top, bounds.right, bounds.bottom),
        )
        return {"width": bounds.width, "height": bounds.height}
