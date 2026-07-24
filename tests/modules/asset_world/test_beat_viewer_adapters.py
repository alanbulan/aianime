from __future__ import annotations

from pathlib import Path

import pytest

from ai_anime.modules.asset_world.infrastructure.beat_viewer import (
    AssetWorldBeatViewerRuntimePropMenuSource,
    CompatibleBeatViewerEpisodeSource,
    ProjectBeatViewerMediaUrls,
    SqliteBeatViewerWorkspace,
)
from ai_anime.modules.project_workspace.public import ProjectContext


class _Store:
    def __init__(self) -> None:
        self.close_calls = 0

    async def close(self) -> None:
        self.close_calls += 1

    def get_episode(self, episode_num: int):
        return {"episode": episode_num}

    def get_cached_prop(self, prop_id: str):
        return {"prop_id": prop_id}


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


@pytest.mark.asyncio
async def test_sqlite_beat_viewer_workspace_closes_store_after_failure(
    monkeypatch,
    tmp_path: Path,
) -> None:
    from ai_anime.modules.asset_world.infrastructure import beat_viewer

    context = _context(tmp_path)
    store = _Store()

    async def make_store(candidate):
        assert candidate is context
        return store

    monkeypatch.setattr(
        beat_viewer.project_stores,
        "make_sqlite_store_for_context",
        make_store,
    )

    with pytest.raises(RuntimeError, match="failed"):
        async with SqliteBeatViewerWorkspace().session(context) as opened:
            assert opened is store
            raise RuntimeError("failed")

    assert store.close_calls == 1


def test_beat_viewer_episode_prop_menu_and_media_adapters(
    monkeypatch,
    tmp_path: Path,
) -> None:
    from ai_anime.modules.asset_world.infrastructure import beat_viewer

    context = _context(tmp_path)
    context.output_dir.mkdir(parents=True)
    asset = context.output_dir / "director_worlds" / "scene" / "master.sog"
    asset.parent.mkdir(parents=True)
    asset.write_bytes(b"sog")
    store = _Store()

    class PropCatalog:
        def runtime_episode_prop_menu(self, *, repository, episode, beats):
            assert repository.available() is True
            assert repository.get_cached_prop("cup") == {"prop_id": "cup"}
            assert episode == {"episode": 2}
            assert beats == [{"beat_number": 4}]
            return [{"prop_id": "cup", "marker_color": "#123456"}]

    monkeypatch.setattr(
        beat_viewer.project_media,
        "make_project_static_url",
        lambda ctx, rel, local_path=None: f"/projects/{ctx.project_id}/{rel}",
    )

    episode = CompatibleBeatViewerEpisodeSource().episode_or_none(store, 2)
    prop_menu = AssetWorldBeatViewerRuntimePropMenuSource(PropCatalog()).for_episode(
        store,
        episode,
        [{"beat_number": 4}],
    )
    asset_url = ProjectBeatViewerMediaUrls().asset_url(context)

    assert prop_menu == [{"prop_id": "cup", "marker_color": "#123456"}]
    assert asset_url(asset) == ("/projects/project-1/director_worlds/scene/master.sog")
    assert asset_url(tmp_path / "outside.sog") == ""
