from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

import pytest

from ai_anime.modules.asset_world.application.beat_viewer import (
    BeatViewerBeatNotFound,
    BeatViewerQuery,
    BeatViewerSceneMissing,
    BeatViewerUseCases,
)
from ai_anime.modules.asset_world.application.dto import (
    ExportBeatDirectorControlFrameCommand,
    SaveBeatDirectorOverlayCommand,
)
from ai_anime.modules.project_workspace.public import ProjectContext


class _Store:
    def __init__(self, beats: list[dict]) -> None:
        self.beats = beats
        self.updates: list[dict] = []

    async def get_beats_as_dicts(self, episode_num: int) -> list[dict]:
        assert episode_num == 2
        return list(self.beats)

    def get_sketch_colors(self, episode_num: int) -> dict[str, str]:
        assert episode_num == 2
        return {"hero_default": "#ff00ff LABEL"}

    async def update_beat_asset(self, **updates):
        self.updates.append(updates)
        return True


class _Workspace:
    def __init__(self, store: _Store) -> None:
        self.store = store
        self.contexts: list[ProjectContext] = []
        self.exit_count = 0

    @asynccontextmanager
    async def session(self, context: ProjectContext):
        self.contexts.append(context)
        try:
            yield self.store
        finally:
            self.exit_count += 1


class _MediaUrls:
    def asset_url(self, context: ProjectContext):
        def build(path: str | Path) -> str:
            relative = Path(path).relative_to(context.output_dir).as_posix()
            return f"/projects/{context.project_id}/{relative}"

        return build


class _SceneViewer:
    def __init__(self) -> None:
        self.pano_calls: list[dict] = []
        self.stage_calls: list[dict] = []

    def beat_pano_manifest(self, **kwargs):
        self.pano_calls.append(kwargs)
        return {"url": kwargs["asset_url"](kwargs["project_dir"] / "pano.png")}

    def default_director_stage_palette(self):
        return {"actors": [], "props": []}

    def beat_director_stage_manifest(self, **kwargs):
        self.stage_calls.append(kwargs)
        return {"scene_name": kwargs["scene_name"]}


class _DirectorStage:
    def __init__(self) -> None:
        self.calls: list[dict] = []
        self.load_calls: list[dict] = []
        self.save_calls: list[dict] = []
        self.export_calls: list[dict] = []

    def control_frame_status(self, **kwargs):
        self.calls.append(kwargs)
        return {
            "ready": False,
            "url": kwargs["asset_url"](kwargs["project_dir"] / "frame.png"),
        }

    async def load_overlay(self, **kwargs):
        self.load_calls.append(kwargs)
        return {"status": "missing"}

    async def save_overlay(self, **kwargs):
        self.save_calls.append(kwargs)
        await kwargs["asset_writer"].update_beat_asset(saved=True)
        return {"status": "saved"}

    def export_control_frame(self, **kwargs):
        self.export_calls.append(kwargs)
        return {"url": kwargs["asset_url"](kwargs["project_dir"] / "frame.png")}


class _Episodes:
    def episode_or_none(self, store, episode_num: int):
        assert episode_num == 2
        return {"episode": episode_num}


class _PropMenus:
    def for_episode(self, store, episode, beats):
        assert episode == {"episode": 2}
        assert len(beats) == 1
        return [
            {"prop_id": "cup", "marker_color": "#123456 LABEL"},
            {"prop_id": "missing-color"},
            {"marker_color": "#ffffff"},
        ]


def _context(tmp_path: Path) -> ProjectContext:
    return ProjectContext(
        project_id="project-1",
        project_name="demo",
        owner_type="user",
        owner_id="owner-1",
        owner_username="alice",
        requester_user_id="user-1",
        requester_username="alice",
        requester_principals=(("user", "user-1"),),
        effective_role="viewer",
        home_node_id="local",
        output_dir=tmp_path / "output",
        state_dir=tmp_path / "state",
        runtime_dir=tmp_path / "runtime",
        is_home_node=True,
    )


def _use_cases(store: _Store):
    workspace = _Workspace(store)
    scene_viewer = _SceneViewer()
    director_stage = _DirectorStage()
    return (
        BeatViewerUseCases(
            workspace,
            _MediaUrls(),
            scene_viewer,
            director_stage,
            _Episodes(),
            _PropMenus(),
        ),
        workspace,
        scene_viewer,
        director_stage,
    )


@pytest.mark.asyncio
async def test_beat_viewer_composes_project_manifests_and_status(
    tmp_path: Path,
) -> None:
    beat = {
        "beat_number": 4,
        "scene_ref": {"scene_id": "地下室"},
    }
    use_cases, workspace, scene_viewer, director_stage = _use_cases(_Store([beat]))
    context = _context(tmp_path)
    query = BeatViewerQuery(episode_num=2, beat_num=4)

    pano = await use_cases.pano_background_manifest(context, query)
    stage = await use_cases.director_stage_manifest(context, query)
    overlay = await use_cases.load_director_stage_overlay(context, query)
    saved_overlay = await use_cases.save_director_stage_overlay(
        context,
        query,
        SaveBeatDirectorOverlayCommand(snapshot={"actors": []}),
    )
    exported = await use_cases.export_director_stage_control_frame(
        context,
        query,
        ExportBeatDirectorControlFrameCommand(
            images={"combined": "data", "env_only": "data"},
            frame_meta={"camera": {}},
        ),
    )
    status = use_cases.director_control_frame_status(context, query)

    assert pano == {"url": "/projects/project-1/pano.png"}
    assert stage == {"scene_name": "地下室"}
    assert overlay == {"status": "missing"}
    assert saved_overlay == {"status": "saved"}
    assert exported == {"url": "/projects/project-1/frame.png"}
    assert use_cases.default_director_stage_palette() == {"actors": [], "props": []}
    assert scene_viewer.pano_calls[0]["beat"] is beat
    assert scene_viewer.stage_calls[0]["sketch_colors"] == {
        "hero_default": "#ff00ff LABEL"
    }
    assert scene_viewer.stage_calls[0]["prop_marker_colors"] == {"cup": "#123456 LABEL"}
    assert status == {"ready": False, "url": "/projects/project-1/frame.png"}
    assert director_stage.calls[0]["episode_num"] == 2
    assert director_stage.load_calls[0]["repository"] is workspace.store
    assert director_stage.save_calls[0]["asset_writer"] is workspace.store
    assert director_stage.export_calls[0]["scene_name"] == "地下室"
    assert workspace.store.updates == [{"saved": True}]
    assert workspace.contexts == [context, context, context, context, context]
    assert workspace.exit_count == 5


@pytest.mark.asyncio
async def test_beat_viewer_rejects_missing_beat_and_scene(tmp_path: Path) -> None:
    context = _context(tmp_path)
    query = BeatViewerQuery(episode_num=2, beat_num=4)
    missing_beat, workspace, _viewer, _director = _use_cases(_Store([]))

    with pytest.raises(BeatViewerBeatNotFound, match="Beat 4 not found"):
        await missing_beat.pano_background_manifest(context, query)
    assert workspace.exit_count == 1

    missing_scene, workspace, _viewer, _director = _use_cases(
        _Store([{"beat_number": 4}])
    )
    with pytest.raises(BeatViewerSceneMissing, match="当前 Beat 没有关联场景"):
        await missing_scene.director_stage_manifest(context, query)
    assert workspace.exit_count == 1
