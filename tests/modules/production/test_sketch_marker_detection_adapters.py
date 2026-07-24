from __future__ import annotations

from pathlib import Path

import pytest

from ai_anime.modules.production.infrastructure import sketch_marker_detection
from ai_anime.modules.production.infrastructure.sketch_marker_detection import (
    GlobalVideoOptimizerSketchMarkerDetector,
    LocalSketchMarkerDetectionFiles,
)


def test_local_files_find_known_frames_in_numeric_beat_order(tmp_path: Path) -> None:
    sketches_dir = tmp_path / "sketches" / "ep002"
    sketches_dir.mkdir(parents=True)
    for name in (
        "beat_10.png",
        "beat_2.jpg",
        "beat_03.png",
        "beat_4.jpeg",
        "notes.txt",
    ):
        (sketches_dir / name).write_bytes(b"frame")

    frames = LocalSketchMarkerDetectionFiles().find_frames(
        tmp_path,
        2,
        {2, 3, 10},
    )

    assert [frame.beat_number for frame in frames] == [2, 3, 10]
    assert [frame.path.name for frame in frames] == [
        "beat_2.jpg",
        "beat_03.png",
        "beat_10.png",
    ]


def test_local_files_prepare_grid_and_delegate_combination(
    tmp_path: Path,
    monkeypatch,
) -> None:
    captured: dict = {}

    def fake_combine_to_grid(image_paths, output_path, *, rows, cols):
        captured.update(
            {
                "image_paths": image_paths,
                "output_path": output_path,
                "rows": rows,
                "cols": cols,
            }
        )

    monkeypatch.setattr(
        sketch_marker_detection,
        "combine_to_grid",
        fake_combine_to_grid,
    )
    files = LocalSketchMarkerDetectionFiles()
    grid_dir = files.prepare_grid_dir(tmp_path, 2)
    output_path = grid_dir / "grid.png"

    files.combine_grid(
        [Path("beat_1.png"), Path("beat_2.png")],
        output_path,
        rows=2,
        cols=2,
    )

    assert grid_dir.is_dir()
    assert captured == {
        "image_paths": ["beat_1.png", "beat_2.png"],
        "output_path": output_path,
        "rows": 2,
        "cols": 2,
    }


@pytest.mark.asyncio
async def test_detector_delegates_to_global_video_optimizer(monkeypatch) -> None:
    captured: dict = {}

    async def fake_detect_identities_by_ai(**kwargs):
        captured.update(kwargs)
        return {1: ["Hero_Main"]}

    monkeypatch.setattr(
        sketch_marker_detection.global_video_optimizer,
        "detect_identities_by_ai",
        fake_detect_identities_by_ai,
    )

    result = await GlobalVideoOptimizerSketchMarkerDetector().detect(
        grid_path=Path("grid.png"),
        color_marker_map={"#FF0000 RED": "Hero_Main"},
        total_panels=1,
    )

    assert result == {1: ["Hero_Main"]}
    assert captured == {
        "sketch_image_paths": ["grid.png"],
        "color_identity_map": {"#FF0000 RED": "Hero_Main"},
        "total_beats": 1,
    }
