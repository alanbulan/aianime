from __future__ import annotations

from datetime import datetime
from pathlib import Path
from types import SimpleNamespace

import pytest

from ai_anime.models import PoolImage, PoolIndex
from ai_anime.modules.production.infrastructure.grid_pool import LocalGridPoolGateway
from ai_anime.modules.project_workspace.public import ProjectContext


class _Store:
    def __init__(self) -> None:
        self.close_calls = 0

    async def get_script_as_dict(self, episode_num: int):
        assert episode_num == 2
        return {
            "sketch_colors": {"hero": "#112233"},
            "beats": [
                {"beat_number": 5, "visual_description": "hero enters"},
                {"visual_description": "missing beat number"},
            ],
        }

    async def close(self) -> None:
        self.close_calls += 1


def _context(tmp_path: Path) -> ProjectContext:
    return ProjectContext(
        project_id="proj-grid-123",
        project_name="demo",
        owner_type="user",
        owner_id="user-alice",
        owner_username="alice",
        requester_user_id="user-alice",
        requester_username="alice",
        requester_principals=(("user", "user-alice"),),
        effective_role="editor",
        home_node_id="local",
        output_dir=tmp_path / "output" / "alice" / "demo",
        state_dir=tmp_path / "state" / "alice" / "demo",
        runtime_dir=tmp_path / "runtime" / "alice" / "demo",
        is_home_node=True,
    )


@pytest.mark.asyncio
async def test_list_pool_returns_none_without_opening_store(
    monkeypatch,
    tmp_path: Path,
) -> None:
    from ai_anime.modules.production.infrastructure import grid_pool

    monkeypatch.setattr(grid_pool.pool_indexer, "load_pool_index", lambda _path: None)

    async def unexpected_store(_context):
        pytest.fail("无图片池时不应创建 Store")

    monkeypatch.setattr(
        grid_pool.project_stores,
        "make_sqlite_store_for_context",
        unexpected_store,
    )

    assert await LocalGridPoolGateway().list_pool(_context(tmp_path), 2) is None


@pytest.mark.asyncio
async def test_list_pool_projects_hashes_urls_and_closes_store(
    monkeypatch,
    tmp_path: Path,
) -> None:
    from ai_anime.modules.production.infrastructure import grid_pool

    context = _context(tmp_path)
    grids_dir = Path(context.output_dir) / "grids" / "ep002"
    pool = PoolIndex(
        episode=2,
        modes={"2x2": {"total_grids": 1, "total_cells": 2}},
        images=[
            PoolImage(
                id="beat_05_render",
                mode="2x2",
                grid_index=1,
                cell_index=1,
                grid_path="scene/render_grid.png",
                cell_path="render/beat_05.png",
                row=0,
                col=0,
                original_beat=5,
                generated_at=datetime(2026, 7, 24, 12, 30, 0),
                type="render",
            ),
            PoolImage(
                id="beat_06_sketch",
                mode="2x2",
                grid_index=1,
                cell_index=2,
                grid_path="",
                cell_path=None,
                row=0,
                col=1,
                original_beat=6,
                generated_at=None,
                type="sketch",
                beat_content_hash="old-hash",
            ),
        ],
        beat_assignments={"5": "beat_05_render"},
    )
    store = _Store()
    loaded_paths: list[Path] = []
    hash_calls: list[tuple[dict, dict[str, str]]] = []
    stale_calls: list[tuple[PoolImage, dict[int, str], object]] = []
    url_calls: list[tuple[str, Path]] = []

    def load_pool(path):
        loaded_paths.append(path)
        return pool

    async def make_store(candidate):
        assert candidate is context
        return store

    def compute_hash(beat, sketch_colors):
        hash_calls.append((beat, sketch_colors))
        return "current-hash"

    def is_stale(image, beat_hashes, script_mt):
        stale_calls.append((image, beat_hashes, script_mt))
        return image.type == "sketch"

    def media_url(candidate, relative_path, local_path=None):
        assert candidate is context
        url_calls.append((relative_path, local_path))
        return f"/static/projects/{candidate.project_id}/{relative_path}"

    monkeypatch.setattr(grid_pool.pool_indexer, "load_pool_index", load_pool)
    monkeypatch.setattr(
        grid_pool.project_stores,
        "make_sqlite_store_for_context",
        make_store,
    )
    monkeypatch.setattr(
        grid_pool.pool_indexer,
        "compute_beat_content_hash",
        compute_hash,
    )
    monkeypatch.setattr(grid_pool.pool_indexer, "is_pool_image_stale", is_stale)

    listing = await LocalGridPoolGateway(media_url).list_pool(context, 2)

    assert listing is not None
    assert loaded_paths == [grids_dir]
    assert hash_calls == [
        (
            {"beat_number": 5, "visual_description": "hero enters"},
            {"hero": "#112233"},
        )
    ]
    assert stale_calls == [
        (pool.images[0], {5: "current-hash"}, None),
        (pool.images[1], {5: "current-hash"}, None),
    ]
    assert url_calls == [
        (
            "grids/ep002/render/beat_05.png",
            grids_dir / "render" / "beat_05.png",
        ),
        (
            "grids/ep002/scene/render_grid.png",
            grids_dir / "scene" / "render_grid.png",
        ),
    ]
    payload = listing.as_dict()
    assert payload["episode"] == 2
    assert payload["modes"] == {"2x2": {"total_grids": 1, "total_cells": 2}}
    assert payload["beat_assignments"] == {"5": "beat_05_render"}
    assert payload["images"][0]["generated_at"] == "2026-07-24T12:30:00"
    assert payload["images"][0]["stale"] is False
    assert payload["images"][1]["generated_at"] is None
    assert payload["images"][1]["cell_url"] == ""
    assert payload["images"][1]["grid_url"] == ""
    assert payload["images"][1]["stale"] is True
    assert store.close_calls == 1


def test_rebuild_pool_uses_episode_directory_and_projects_counts(
    monkeypatch,
    tmp_path: Path,
) -> None:
    from ai_anime.modules.production.infrastructure import grid_pool

    context = _context(tmp_path)
    calls: list[tuple[Path, int, bool]] = []

    def rebuild_pool_index(*, episode_grids_dir, episode, split_cells):
        calls.append((episode_grids_dir, episode, split_cells))
        return SimpleNamespace(
            episode=episode,
            images=[object(), object()],
            modes={"render": {}, "sketch": {}},
        )

    monkeypatch.setattr(
        grid_pool.pool_indexer,
        "rebuild_pool_index",
        rebuild_pool_index,
    )

    rebuilt = LocalGridPoolGateway().rebuild(context, 3)
    grids_dir = Path(context.output_dir) / "grids" / "ep003"

    assert grids_dir.is_dir()
    assert calls == [(grids_dir, 3, True)]
    assert rebuilt.as_dict() == {
        "episode": 3,
        "image_count": 2,
        "mode_count": 2,
    }
