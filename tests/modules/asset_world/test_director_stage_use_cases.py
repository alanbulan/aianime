from __future__ import annotations

from collections.abc import Mapping
from pathlib import Path
from typing import Any

import pytest

from ai_anime.modules.asset_world.application.director_stage import (
    BeatDirectorStageUseCases,
    resolve_beat_scene_name,
)
from ai_anime.modules.asset_world.application.dto import (
    DirectorControlFrameExport,
    ExportBeatDirectorControlFrameCommand,
    SaveBeatDirectorOverlayCommand,
)
from ai_anime.modules.asset_world.application.errors import SceneViewerRejected


class _Files:
    def __init__(self) -> None:
        self.overlays: dict[tuple[int, int], dict[str, Any]] = {}
        self.existing: set[Path] = set()

    def overlay_path(
        self,
        project_dir: Path,
        episode_num: int,
        beat_num: int,
    ) -> Path:
        return (
            project_dir
            / "director_blockings"
            / f"ep{episode_num:03d}"
            / f"beat_{beat_num:02d}.json"
        )

    def load_overlay(
        self,
        project_dir: Path,
        episode_num: int,
        beat_num: int,
    ) -> dict[str, Any] | None:
        return self.overlays.get((episode_num, beat_num))

    def save_overlay(
        self,
        project_dir: Path,
        episode_num: int,
        beat_num: int,
        payload: dict[str, Any],
    ) -> Path:
        self.overlays[(episode_num, beat_num)] = payload
        return self.overlay_path(project_dir, episode_num, beat_num)

    def control_frame_path(
        self,
        project_dir: Path,
        episode_num: int,
        beat_num: int,
    ) -> Path:
        return (
            project_dir
            / "director_control_frames"
            / f"ep{episode_num:03d}"
            / f"beat_{beat_num:02d}"
            / "combined.png"
        )

    def exists(self, path: Path) -> bool:
        return path in self.existing

    def project_relative_path(self, project_dir: Path, path: Path) -> str | None:
        try:
            return path.relative_to(project_dir).as_posix()
        except ValueError:
            return None

    def export_control_frame(
        self,
        project_dir: Path,
        episode_num: int,
        beat_num: int,
        *,
        images: Mapping[str, str],
        meta: Mapping[str, Any],
    ) -> DirectorControlFrameExport:
        target = self.control_frame_path(project_dir, episode_num, beat_num).parent
        paths = {
            "combined": target / "combined.png",
            "env_only": target / "env_only.png",
            "frame_meta": target / "frame_meta.json",
        }
        relative_paths = {
            kind: path.relative_to(project_dir).as_posix()
            for kind, path in paths.items()
        }
        persisted_meta = {**meta, "paths": dict(relative_paths)}
        return DirectorControlFrameExport(
            directory=target,
            paths=paths,
            relative_paths=relative_paths,
            meta=persisted_meta,
        )


class _Repository:
    def __init__(self, beats: list[dict[str, Any]] | None = None) -> None:
        self.updates: list[dict[str, Any]] = []
        self.beats = beats or []

    async def get_beats_as_dicts(self, episode_num: int) -> list[dict[str, Any]]:
        return self.beats

    async def update_beat_asset(self, **updates: Any) -> None:
        self.updates.append(updates)


def _asset_url(path: Path) -> str:
    return f"/static/{path.name}"


@pytest.mark.asyncio
async def test_overlay_loads_latest_previous_same_scene_beat(tmp_path: Path) -> None:
    files = _Files()
    files.overlays[(1, 2)] = {"beat": 2}
    files.overlays[(1, 3)] = {"beat": 3}
    use_cases = BeatDirectorStageUseCases(files)
    beats = [
        {"beat_number": 4, "scene_ref": {"scene_id": "地下室"}},
        {"beat_number": 1, "scene_ref": {"scene_id": "大厅"}},
        {"beat_number": 3, "scene_ref": {"scene_id": "地下室"}},
        {"beat_number": 2, "location": "地下室"},
        {"beat_number": "invalid", "scene_ref": {"scene_id": "地下室"}},
    ]

    data = await use_cases.load_overlay(
        repository=_Repository(beats),
        project_dir=tmp_path,
        episode_num=1,
        beat_num=4,
        scene_name="地下室",
    )

    assert data["status"] == "inherited"
    assert data["overlay"] == {"beat": 3}
    assert data["inherited_from_beat"] == 3
    assert [item["beat"] for item in data["same_scene_beats"]] == [2, 3, 4]
    assert resolve_beat_scene_name({"location": "备用场景"}) == "备用场景"


@pytest.mark.asyncio
async def test_overlay_save_normalizes_payload_and_updates_detected_props(
    tmp_path: Path,
) -> None:
    files = _Files()
    beat = {
        "beat_number": 4,
        "scene_ref": {"scene_id": "地下室"},
        "detected_identities": ["陆辰_default"],
        "detected_props": ["账单"],
    }
    repository = _Repository([beat])
    use_cases = BeatDirectorStageUseCases(files)

    data = await use_cases.save_overlay(
        repository=repository,
        asset_writer=repository,
        project_dir=tmp_path,
        episode_num=1,
        beat_num=4,
        scene_name="地下室",
        beat=beat,
        command=SaveBeatDirectorOverlayCommand(
            frame_aspect="2:3",
            frame_meta={"source": {"source_id": "pano"}},
            snapshot={"camera": {"azim": 1}},
            actors=[{"identity_id": "陆辰_default"}],
            props=[{"prop_id": "钥匙", "type": "prop_hero"}],
            stagings=[{"prop_id": "纸箱", "type": "prop_staging"}],
            deleted_keys=["prop:账单"],
        ),
    )

    overlay = data["overlay"]
    assert data["status"] == "saved"
    assert overlay["source"] == {"source_id": "pano"}
    assert overlay["camera"] == {"azim": 1}
    assert overlay["props"] == [
        {"prop_id": "钥匙", "type": "prop_hero"},
        {"prop_id": "纸箱", "type": "prop_staging"},
    ]
    assert overlay["deleted_keys"] == ["prop:账单"]
    assert overlay["saved_at"]
    assert repository.updates == [
        {
            "episode_number": 1,
            "beat_number": 4,
            "detected_props": ["账单", "钥匙"],
        }
    ]
    assert files.overlays[(1, 4)] is overlay


def test_control_frame_status_and_export_share_canonical_bundle(
    tmp_path: Path,
) -> None:
    files = _Files()
    use_cases = BeatDirectorStageUseCases(files)

    missing = use_cases.control_frame_status(
        project_dir=tmp_path,
        episode_num=2,
        beat_num=3,
        asset_url=_asset_url,
    )
    assert missing["ready"] is False
    assert missing["url"] is None
    assert missing["scope"] == "director_control_to_sketch:ep002:beat_03"

    files.existing.add(Path(missing["path"]))
    ready = use_cases.control_frame_status(
        project_dir=tmp_path,
        episode_num=2,
        beat_num=3,
        asset_url=_asset_url,
    )
    assert ready["ready"] is True
    assert ready["rel_path"] == ("director_control_frames/ep002/beat_03/combined.png")
    assert ready["url"] == "/static/combined.png"

    exported = use_cases.export_control_frame(
        project_dir=tmp_path,
        scene_name="大厅",
        episode_num=2,
        beat_num=3,
        command=ExportBeatDirectorControlFrameCommand(
            images={"combined": "png", "env_only": "png"},
            frame_meta={"camera": "wide"},
            props=[{"prop_id": "手机"}],
            stagings=[{"prop_id": "箱子"}],
        ),
        asset_url=_asset_url,
    )
    assert exported["meta"]["scene_id"] == "大厅"
    assert exported["meta"]["props"] == [
        {"prop_id": "手机"},
        {"prop_id": "箱子"},
    ]
    assert exported["rel_paths"]["combined"] == ready["rel_path"]
    assert exported["urls"]["frame_meta"] == "/static/frame_meta.json"


def test_control_frame_export_rejects_incomplete_bundle(tmp_path: Path) -> None:
    use_cases = BeatDirectorStageUseCases(_Files())

    with pytest.raises(
        SceneViewerRejected,
        match="combined, env_only and frame_meta are required",
    ):
        use_cases.export_control_frame(
            project_dir=tmp_path,
            scene_name="大厅",
            episode_num=1,
            beat_num=1,
            command=ExportBeatDirectorControlFrameCommand(
                images={"combined": "png"},
                frame_meta={"camera": "wide"},
            ),
            asset_url=_asset_url,
        )
