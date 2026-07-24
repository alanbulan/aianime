from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest

from ai_anime.modules.production.application.sketch_pose import (
    SketchPoseCandidatesMissing,
    SketchPoseEditorUseCases,
)


class _Files:
    def __init__(self, image_size: tuple[int, int] = (100, 200)) -> None:
        self._image_size = image_size
        self.saved: tuple[Path, dict[str, Any]] | None = None

    def image_size(self, image_path: Path) -> tuple[int, int]:
        return self._image_size

    def save_editor_state(
        self,
        image_path: Path,
        editor_state: dict[str, Any],
    ) -> None:
        self.saved = (image_path, editor_state)


class _Identities:
    def __init__(self, identity_ids: list[str]) -> None:
        self._identity_ids = identity_ids

    def detected_identity_ids(self, beat: dict[str, Any]) -> list[str]:
        return list(self._identity_ids)


def test_load_editor_prefers_detected_beat_identities(tmp_path: Path) -> None:
    use_cases = SketchPoseEditorUseCases(
        _Files((100, 200)),
        _Identities(["Hero_Main"]),
    )

    result = use_cases.load_editor(
        sketch_path=tmp_path / "beat_01.png",
        beat={"detected_identities": ["ignored-by-port"]},
        sketch_colors={
            "Hero_Main": "#00ffff CYAN",
            "Support_Main": "#ff0000 RED",
        },
    )

    assert result["width"] == 100
    assert result["height"] == 200
    assert result["candidates"] == [
        {
            "identity_id": "Hero_Main",
            "color_hex": "#00ffff",
            "color_name": "CYAN",
        }
    ]
    assert result["skeletons"][0]["identityId"] == "Hero_Main"
    assert result["skeletons"][0]["active"] is True
    assert "standing_front" in result["pose_presets"]


def test_load_editor_falls_back_to_episode_colors(tmp_path: Path) -> None:
    use_cases = SketchPoseEditorUseCases(_Files(), _Identities([]))

    result = use_cases.load_editor(
        sketch_path=tmp_path / "beat_01.png",
        beat={},
        sketch_colors={"Hero_Main": "#00ffff CYAN"},
    )

    assert [item["identity_id"] for item in result["candidates"]] == [
        "Hero_Main"
    ]


def test_load_editor_rejects_missing_colored_identities(tmp_path: Path) -> None:
    use_cases = SketchPoseEditorUseCases(_Files(), _Identities([]))

    with pytest.raises(SketchPoseCandidatesMissing):
        use_cases.load_editor(
            sketch_path=tmp_path / "beat_01.png",
            beat={},
            sketch_colors={},
        )


def test_save_editor_delegates_to_files(tmp_path: Path) -> None:
    files = _Files()
    use_cases = SketchPoseEditorUseCases(files, _Identities([]))
    sketch_path = tmp_path / "beat_01.png"
    state = {"strokes": []}

    use_cases.save_editor(sketch_path=sketch_path, editor_state=state)

    assert files.saved == (sketch_path, state)
