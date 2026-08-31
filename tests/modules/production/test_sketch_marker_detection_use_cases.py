from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest

from ai_anime.modules.production.application.sketch_marker_detection import (
    DetectSketchMarkersCommand,
    SketchMarkerDetectionFailed,
    SketchMarkerDetectionRejected,
    SketchMarkerDetectionUseCases,
)
from ai_anime.modules.production.domain.sketch_marker_detection import (
    SketchDetectionFrame,
)


class _Store:
    def __init__(self, beats: list[dict[str, Any]]) -> None:
        self.beats = beats
        self.identity_writes: dict[int, list[str]] = {}
        self.prop_writes: dict[int, list[str]] = {}

    async def get_beats_as_dicts(self, episode_num: int) -> list[dict[str, Any]]:
        assert episode_num == 2
        return self.beats

    def get_sketch_colors(self, episode_num: int) -> dict[str, str]:
        assert episode_num == 2
        return {"Hero_Main": "#FF0000 RED"}

    async def get_script_as_dict(self, episode_num: int) -> dict[str, Any]:
        assert episode_num == 2
        return {"prop_menu": []}

    def get_all_characters(self) -> list[dict[str, Any]]:
        return [
            {"identities": [{"identity_id": "Hero_Main"}]},
            {"identities": [{"identity_id": "Heroine_Main"}]},
        ]

    async def set_beat_detected_identities(
        self,
        episode_num: int,
        detections: dict[int, list[str]],
    ) -> int:
        assert episode_num == 2
        self.identity_writes = detections
        return len(detections)

    async def set_beat_detected_props(
        self,
        episode_num: int,
        detections: dict[int, list[str]],
    ) -> int:
        assert episode_num == 2
        self.prop_writes = detections
        return len(detections)


class _Episodes:
    def episode_or_none(self, store: Any, episode_num: int) -> None:
        return None


class _PropMenus:
    async def for_episode(self, store: Any, episode: Any, beats: list[dict]) -> list:
        return []


class _Files:
    def __init__(self, frames: list[SketchDetectionFrame]) -> None:
        self.frames = frames
        self.combinations: list[dict[str, Any]] = []

    def find_frames(
        self,
        project_dir: Path,
        episode_num: int,
        known_beat_numbers: set[int],
    ) -> list[SketchDetectionFrame]:
        assert episode_num == 2
        return list(reversed(self.frames))

    def prepare_grid_dir(self, project_dir: Path, episode_num: int) -> Path:
        assert episode_num == 2
        return project_dir / "grids"

    def combine_grid(
        self,
        image_paths: list[Path],
        output_path: Path,
        *,
        rows: int,
        cols: int,
    ) -> None:
        self.combinations.append(
            {
                "image_paths": image_paths,
                "output_path": output_path,
                "rows": rows,
                "cols": cols,
            }
        )


class _Detector:
    def __init__(
        self,
        *,
        error: Exception | None = None,
        detections: dict[int, list[str]] | None = None,
    ) -> None:
        self.error = error
        self.detections = detections if detections is not None else {1: ["Hero_Main"]}
        self.calls: list[dict[str, Any]] = []

    async def detect(self, **kwargs: Any) -> dict[int, list[str]]:
        self.calls.append(kwargs)
        if self.error:
            raise self.error
        return self.detections


def _use_cases(
    frame_count: int,
    *,
    detector_error: Exception | None = None,
    detector_detections: dict[int, list[str]] | None = None,
    visual_description: str = "hero stands in the rain",
) -> tuple[
    SketchMarkerDetectionUseCases,
    _Store,
    _Files,
    _Detector,
]:
    beats = [
        {"beat_number": number, "visual_description": visual_description}
        for number in range(1, frame_count + 1)
    ]
    store = _Store(beats)
    files = _Files(
        [
            SketchDetectionFrame(number, Path(f"beat_{number}.png"))
            for number in range(1, frame_count + 1)
        ]
    )
    detector = _Detector(
        error=detector_error,
        detections=detector_detections,
    )
    return (
        SketchMarkerDetectionUseCases(
            _Episodes(),
            _PropMenus(),
            files,
            detector,
        ),
        store,
        files,
        detector,
    )


@pytest.mark.asyncio
async def test_detection_batches_in_numeric_order() -> None:
    use_cases, store, files, detector = _use_cases(26)

    result = await use_cases.detect(
        store,
        DetectSketchMarkersCommand(
            episode_num=2,
            project_dir=Path("project"),
            requester_user_id="user-1",
            project_id="project-1",
        ),
    )

    assert [call["total_panels"] for call in detector.calls] == [25, 1]
    assert [path.name for path in files.combinations[0]["image_paths"][:3]] == [
        "beat_1.png",
        "beat_2.png",
        "beat_3.png",
    ]
    assert result.identity_detections[1] == ["Hero_Main"]
    assert result.identity_detections[26] == ["Hero_Main"]
    assert result.identity_detections[2] == ["__NO_CHARACTER__"]
    assert result.total_identities == 2
    assert store.identity_writes == result.identity_detections
    assert store.prop_writes[1] == ["__NO_PROP__"]


@pytest.mark.asyncio
async def test_screenplay_markers_override_conflicting_color_detection() -> None:
    use_cases, store, _files, _detector = _use_cases(
        2,
        detector_detections={
            1: ["Heroine_Main"],
            2: ["Heroine_Main"],
        },
        visual_description="{{Hero_Main}}",
    )

    result = await use_cases.detect(
        store,
        DetectSketchMarkersCommand(
            episode_num=2,
            project_dir=Path("project"),
            requester_user_id="user-1",
        ),
    )

    # Both panels are misdetected as Heroine_Main, but the screenplay marker is
    # authoritative and must replace, rather than merge with, color detection.
    assert result.identity_detections == {
        1: ["Hero_Main"],
        2: ["Hero_Main"],
    }
    assert result.total_identities == 2


@pytest.mark.asyncio
async def test_detection_wraps_detector_failure() -> None:
    use_cases, store, _files, _detector = _use_cases(
        1,
        detector_error=RuntimeError("vision failed"),
    )

    with pytest.raises(SketchMarkerDetectionFailed, match="vision failed"):
        await use_cases.detect(
            store,
            DetectSketchMarkersCommand(
                episode_num=2,
                project_dir=Path("project"),
                requester_user_id="user-1",
            ),
        )

    assert store.identity_writes == {}


@pytest.mark.asyncio
async def test_detection_rejects_missing_frames() -> None:
    use_cases, store, files, _detector = _use_cases(1)
    files.frames = []

    with pytest.raises(SketchMarkerDetectionRejected, match="No sketches found"):
        await use_cases.detect(
            store,
            DetectSketchMarkersCommand(
                episode_num=2,
                project_dir=Path("project"),
                requester_user_id="user-1",
            ),
        )
