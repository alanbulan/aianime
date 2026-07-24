from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import pytest

from ai_anime.modules.asset_world.application.dto import (
    SaveSceneDirectorWorldCommand,
    SceneViewerAssetState,
)
from ai_anime.modules.asset_world.application.errors import (
    SceneNotFound,
    SceneViewerRejected,
)
from ai_anime.modules.asset_world.application.scene_viewer import SceneViewerUseCases


@dataclass
class _Scene:
    name: str
    base_scene_id: str = ""
    variant_id: str = ""
    time_of_day: str = ""


class _Repository:
    def __init__(self, scenes: list[_Scene] | None = None) -> None:
        self.scenes = {scene.name: scene for scene in scenes or []}

    async def list_scenes(self) -> list[_Scene]:
        return list(self.scenes.values())

    async def get_scene(self, name: str) -> _Scene | None:
        return self.scenes.get(name)


class _Assets:
    def __init__(self) -> None:
        self.masters: set[str] = set()
        self.states: dict[str, SceneViewerAssetState] = {}
        self.corrections: list[tuple[Path, str, dict]] = []
        self.saved_worlds: list[tuple[str, str, dict]] = []

    def has_master(self, project_dir: Path, scene_name: str) -> bool:
        return scene_name in self.masters

    def load(self, project_dir: Path, scene_name: str) -> SceneViewerAssetState:
        return self.states.get(scene_name, _state())

    def filesystem_url(self, path: Path) -> str:
        return f"fs://{path.as_posix()}"

    def director_blockings_filesystem_url(
        self,
        project_dir: Path,
        episode_num: int,
    ) -> str:
        return f"fs://{project_dir.as_posix()}/director_blockings/ep{episode_num:03d}"

    def director_control_frames_filesystem_url(self, project_dir: Path) -> str:
        return f"fs://{project_dir.as_posix()}/director_control_frames"

    def set_pano_correction(
        self,
        project_dir: Path,
        scene_name: str,
        correction,
    ) -> None:
        payload = dict(correction)
        self.corrections.append((project_dir, scene_name, payload))
        current = self.load(project_dir, scene_name)
        self.states[scene_name] = SceneViewerAssetState(
            pano_path=current.pano_path,
            active_splat_path=current.active_splat_path,
            collision_path=current.collision_path,
            splat_paths=current.splat_paths,
            manifest_source=current.manifest_source,
            pano_correction=payload,
            scene_world=current.scene_world,
        )

    def save_director_world(
        self,
        project_dir: Path,
        scene_name: str,
        *,
        active_source_id: str,
        snapshot: dict,
        active_source: dict | None,
    ) -> dict:
        source_id = active_source_id or str(
            (snapshot.get("world") or {}).get("activeSourceId") or ""
        )
        if not source_id:
            raise ValueError("active_source_id is required")
        saved = {
            "active_source_id": source_id,
            "active_source": active_source or {},
            "scene": snapshot,
            "scenes_by_source_id": {source_id: snapshot},
        }
        self.saved_worlds.append((scene_name, source_id, snapshot))
        current = self.load(project_dir, scene_name)
        self.states[scene_name] = SceneViewerAssetState(
            pano_path=current.pano_path,
            active_splat_path=current.active_splat_path,
            collision_path=current.collision_path,
            splat_paths=current.splat_paths,
            manifest_source=current.manifest_source,
            pano_correction=current.pano_correction,
            scene_world=saved,
        )
        return saved

    def save_director_world_source(self, *args, **kwargs):
        raise AssertionError("not used")

    def clear_director_world(self, *args, **kwargs):
        raise AssertionError("not used")


def _state(
    *,
    pano_path: Path | None = None,
    active_splat_path: Path | None = None,
    collision_path: Path | None = None,
    splat_paths: dict[str, Path | None] | None = None,
    manifest_source: str = "",
    pano_correction: dict | None = None,
    scene_world: dict | None = None,
) -> SceneViewerAssetState:
    return SceneViewerAssetState(
        pano_path=pano_path,
        active_splat_path=active_splat_path,
        collision_path=collision_path,
        splat_paths=splat_paths or {},
        manifest_source=manifest_source,
        pano_correction=pano_correction or {},
        scene_world=scene_world
        or {
            "active_source_id": "",
            "scene": None,
            "scenes_by_source_id": {},
        },
    )


def _use_cases(assets: _Assets) -> SceneViewerUseCases:
    return SceneViewerUseCases(
        assets,
        anonymous_actor_colors=["#AA0000", "#00AA00"],
        anonymous_prop_colors=["#0000AA"],
    )


def _asset_url(path: str | Path) -> str:
    return f"/static/{Path(path).name}"


@pytest.mark.asyncio
async def test_plate_preview_falls_back_when_planned_time_plate_has_no_master(
    tmp_path: Path,
) -> None:
    assets = _Assets()
    repository = _Repository(
        [
            _Scene(name="卫生间"),
            _Scene(
                name="卫生间_夜晚",
                base_scene_id="卫生间",
                time_of_day="夜晚",
            ),
        ]
    )

    data = await _use_cases(assets).preview_plate(
        repository=repository,
        project_dir=tmp_path,
        scene_id="卫生间",
        variant_id="",
        time_of_day="夜晚",
    )

    assert data["resolved_scene_name"] == "卫生间"
    assert data["planned_scene_name"] == "卫生间_夜晚"
    assert data["time_baked"] is False
    assert data["render"] == {
        "resolved_scene_name": "卫生间",
        "planned_scene_name": "卫生间_夜晚",
        "relight": True,
        "status": "planned_missing",
        "label": "Render：已规划 卫生间_夜晚 但暂无图，将使用 卫生间，relight 到 夜晚",
    }


def test_scene_and_beat_manifests_share_asset_and_palette_rules(tmp_path: Path) -> None:
    assets = _Assets()
    pano = tmp_path / "pano_360.png"
    master = tmp_path / "master.sog"
    reverse = tmp_path / "reverse.sog"
    collision = tmp_path / "collision.glb"
    assets.states["大厅"] = _state(
        pano_path=pano,
        active_splat_path=master,
        collision_path=collision,
        splat_paths={
            "master": master,
            "reverse": reverse,
            "pano": None,
            "custom": None,
        },
        pano_correction={
            "front_yaw_deg": 35,
            "sphere_correction_deg": {"roll": 1, "pitch": 2, "yaw": 3},
        },
    )
    use_cases = _use_cases(assets)

    pano_manifest = use_cases.build_pano_manifest(
        project_id="proj_demo",
        project_dir=tmp_path,
        scene_name="大厅",
        asset_url=_asset_url,
        mode="scene",
    )
    stage_manifest = use_cases.beat_director_stage_manifest(
        project_id="proj_demo",
        project_dir=tmp_path,
        scene_name="大厅",
        asset_url=_asset_url,
        episode_num=2,
        beat_num=3,
        beat={
            "visual_description": "人物拿起道具",
            "detected_identities": ["路人_default"],
            "detected_props": ["茶杯"],
        },
        sketch_colors={"主角_default": "#123456 LABEL"},
        prop_marker_colors={"手机": "#654321 LABEL"},
    )

    assert pano_manifest is not None
    assert pano_manifest["correction"] == {
        "front_yaw_deg": 35.0,
        "sphere_correction_deg": {"roll": 1.0, "pitch": 2.0, "yaw": 3.0},
    }
    assert pano_manifest["allowed_destinations"] == [
        "view",
        "download",
        "canvas_screenshot_node",
    ]
    assert stage_manifest["source"] == {
        "source_type": "sog",
        "ply_url": "/static/master.sog",
        "splat_url": "/static/master.sog",
        "splat_format": "sog",
        "source_kind": "master",
        "collision_glb_url": "/static/collision.glb",
    }
    assert [option["kind"] for option in stage_manifest["source_options"]] == [
        "active",
        "master",
        "reverse",
        "pano",
    ]
    assert stage_manifest["palette"]["actors"] == [
        {
            "identity_id": "主角_default",
            "label": "主角_default",
            "color": "#123456",
        }
    ]
    assert stage_manifest["palette"]["props"] == [
        {"prop_id": "手机", "label": "手机", "color": "#654321"}
    ]
    assert stage_manifest["blockings_dir_fs"].endswith(
        "/director_blockings/ep002"
    )
    assert stage_manifest["slate_beat"] == 3


@pytest.mark.asyncio
async def test_scene_viewer_reports_missing_scene_and_missing_assets(
    tmp_path: Path,
) -> None:
    assets = _Assets()
    use_cases = _use_cases(assets)

    with pytest.raises(SceneNotFound, match="Scene '不存在' not found"):
        await use_cases.scene_pano_manifest(
            repository=_Repository(),
            project_id="proj_demo",
            project_dir=tmp_path,
            scene_name="不存在",
            asset_url=_asset_url,
        )

    with pytest.raises(SceneViewerRejected, match="当前场景没有 3GS 资产"):
        await use_cases.scene_director_stage_manifest(
            repository=_Repository([_Scene(name="大厅")]),
            project_id="proj_demo",
            project_dir=tmp_path,
            scene_name="大厅",
            asset_url=_asset_url,
        )


@pytest.mark.asyncio
async def test_director_world_validation_and_manifest_composition(tmp_path: Path) -> None:
    assets = _Assets()
    use_cases = _use_cases(assets)
    repository = _Repository([_Scene(name="大厅")])

    with pytest.raises(SceneViewerRejected, match="snapshot is required"):
        await use_cases.save_director_world(
            repository=repository,
            project_id="proj_demo",
            project_dir=tmp_path,
            scene_name="大厅",
            command=SaveSceneDirectorWorldCommand(snapshot=None),
            asset_url=_asset_url,
        )

    with pytest.raises(SceneViewerRejected, match="active_source_id is required"):
        await use_cases.save_director_world(
            repository=repository,
            project_id="proj_demo",
            project_dir=tmp_path,
            scene_name="大厅",
            command=SaveSceneDirectorWorldCommand(snapshot={"world": {}}),
            asset_url=_asset_url,
        )

    snapshot = {"world": {"activeSourceId": "scene-pano:大厅"}, "nodes": []}
    data = await use_cases.save_director_world(
        repository=repository,
        project_id="proj_demo",
        project_dir=tmp_path,
        scene_name="大厅",
        command=SaveSceneDirectorWorldCommand(snapshot=snapshot),
        asset_url=_asset_url,
    )

    assert data["active_source_id"] == "scene-pano:大厅"
    assert data["manifest"]["active_source_id"] == "scene-pano:大厅"
    assert data["manifest"]["scene"] == snapshot
    assert data["manifest"]["source"]["ply_url"] == ""
