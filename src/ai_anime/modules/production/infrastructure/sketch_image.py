"""Pillow adapter for canonical sketch image edits."""

from pathlib import Path


class PillowSketchImageFiles:
    def image_size(self, image_path: Path) -> tuple[int, int]:
        from PIL import Image

        with Image.open(image_path) as image:
            return image.size

    def crop(
        self,
        image_path: Path,
        bounds: tuple[int, int, int, int],
    ) -> None:
        from PIL import Image

        with Image.open(image_path).convert("RGBA") as image:
            cropped = image.crop(bounds)
            cropped.save(image_path, format="PNG")
