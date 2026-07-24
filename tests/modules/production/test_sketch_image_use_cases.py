from pathlib import Path

import pytest

from ai_anime.modules.production.application.sketch_image import (
    CropSketchCommand,
    SketchCropRejected,
    SketchImageUseCases,
)


class _Files:
    def __init__(self, image_size: tuple[int, int]) -> None:
        self._image_size = image_size
        self.cropped: tuple[Path, tuple[int, int, int, int]] | None = None

    def image_size(self, image_path: Path) -> tuple[int, int]:
        return self._image_size

    def crop(
        self,
        image_path: Path,
        bounds: tuple[int, int, int, int],
    ) -> None:
        self.cropped = (image_path, bounds)


def test_crop_clamps_rectangle_to_image_bounds(tmp_path: Path) -> None:
    files = _Files((100, 100))
    use_cases = SketchImageUseCases(files)
    sketch_path = tmp_path / "beat_01.png"

    result = use_cases.crop(
        sketch_path=sketch_path,
        command=CropSketchCommand(x=-10, y=90, width=50, height=20),
    )

    assert files.cropped == (sketch_path, (0, 90, 50, 100))
    assert result == {"width": 50, "height": 10}


@pytest.mark.parametrize(
    ("command", "message"),
    [
        (CropSketchCommand(x="bad", y=0, width=10, height=10), "裁剪参数无效"),
        (CropSketchCommand(x=0, y=0, width=0, height=10), "裁剪宽高必须大于 0"),
        (CropSketchCommand(x=0, y=0, width=10, height=-1), "裁剪宽高必须大于 0"),
    ],
)
def test_crop_rejects_invalid_rectangles(
    command: CropSketchCommand,
    message: str,
    tmp_path: Path,
) -> None:
    use_cases = SketchImageUseCases(_Files((100, 100)))

    with pytest.raises(SketchCropRejected, match=message):
        use_cases.crop(
            sketch_path=tmp_path / "beat_01.png",
            command=command,
        )
