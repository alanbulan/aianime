from __future__ import annotations

from datetime import datetime
from pathlib import Path
from types import SimpleNamespace

import pytest

from ai_anime.models import PoolImage, PoolIndex
from ai_anime.modules.production.application.grid_pool import (
    GridPoolImageStale,
    GridPoolSelectionRejected,
    SelectGridPoolImageCommand,
)
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


@pytest.mark.asyncio
async def test_sketch_candidates_filter_sort_project_and_close_store(
    monkeypatch,
    tmp_path: Path,
) -> None:
    from ai_anime.modules.production.infrastructure import grid_pool

    context = _context(tmp_path)
    grids_dir = Path(context.output_dir) / "grids" / "ep002"
    current_path = Path(context.output_dir) / "sketches" / "ep002" / "beat_05.png"
    current_path.parent.mkdir(parents=True)
    current_path.write_bytes(b"current")
    for relative_path in ("sketch/old.png", "sketch/new.png"):
        cell_path = grids_dir / relative_path
        cell_path.parent.mkdir(parents=True, exist_ok=True)
        cell_path.write_bytes(relative_path.encode())
    pool = PoolIndex(
        episode=2,
        images=[
            PoolImage(
                id="old",
                mode="2x2",
                grid_index=1,
                cell_index=1,
                grid_path="scene/grid.png",
                cell_path="sketch/old.png",
                row=0,
                col=0,
                original_beat=5,
                generated_at=datetime(2026, 7, 23, 12, 0, 0),
                type="sketch",
            ),
            PoolImage(
                id="new",
                mode="regen",
                grid_index=2,
                cell_index=1,
                grid_path="scene/new-grid.png",
                cell_path="sketch/new.png",
                row=1,
                col=0,
                original_beat=5,
                generated_at=datetime(2026, 7, 24, 12, 0, 0),
                type="sketch",
            ),
            PoolImage(
                id="missing",
                mode="regen",
                grid_index=3,
                cell_index=1,
                grid_path="",
                cell_path="sketch/missing.png",
                row=0,
                col=0,
                original_beat=5,
                type="sketch",
            ),
            PoolImage(
                id="render",
                mode="render",
                grid_index=4,
                cell_index=1,
                grid_path="",
                cell_path="sketch/old.png",
                row=0,
                col=0,
                original_beat=5,
                type="render",
            ),
        ],
    )
    store = _Store()

    async def make_store(_context):
        return store

    monkeypatch.setattr(grid_pool.pool_indexer, "load_pool_index", lambda _path: pool)
    monkeypatch.setattr(
        grid_pool.project_stores,
        "make_sqlite_store_for_context",
        make_store,
    )
    monkeypatch.setattr(
        grid_pool.pool_indexer,
        "compute_beat_content_hash",
        lambda _beat, sketch_colors: f"hash:{sketch_colors['hero']}",
    )
    monkeypatch.setattr(
        grid_pool.pool_indexer,
        "is_pool_image_stale",
        lambda image, beat_hashes, script_mt: (
            image.id == "new"
            and beat_hashes == {5: "hash:#112233"}
            and script_mt is None
        ),
    )

    candidates = await LocalGridPoolGateway(
        lambda _context, relative_path, local_path=None: f"/files/{relative_path}"
    ).sketch_candidates(context, 2, 5)

    payload = candidates.as_dict()
    assert payload["current_sketch_url"] == "/files/sketches/ep002/beat_05.png"
    assert payload["candidate_count"] == 2
    assert [candidate["id"] for candidate in payload["candidates"]] == [
        "new",
        "old",
    ]
    assert payload["candidates"][0]["url"] == "/files/grids/ep002/sketch/new.png"
    assert payload["candidates"][0]["stale"] is True
    assert payload["candidates"][1]["stale"] is False
    assert store.close_calls == 1


@pytest.mark.asyncio
async def test_select_rejects_missing_pool_without_opening_store(
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

    with pytest.raises(
        GridPoolSelectionRejected,
        match="No pool index found",
    ):
        await LocalGridPoolGateway().select(
            _context(tmp_path),
            SelectGridPoolImageCommand(
                episode_num=2,
                beat_num=5,
                pool_id="missing",
            ),
        )


@pytest.mark.asyncio
async def test_select_rejects_stale_sketch_and_closes_store(
    monkeypatch,
    tmp_path: Path,
) -> None:
    from ai_anime.modules.production.infrastructure import grid_pool

    pool = PoolIndex(
        episode=2,
        images=[
            PoolImage(
                id="stale-sketch",
                mode="regen",
                grid_index=1,
                cell_index=1,
                grid_path="",
                cell_path="sketch/stale.png",
                row=0,
                col=0,
                original_beat=1,
                type="sketch",
                beat_content_hash="old-hash",
            )
        ],
    )
    store = _Store()

    async def make_store(_context):
        return store

    monkeypatch.setattr(grid_pool.pool_indexer, "load_pool_index", lambda _path: pool)
    monkeypatch.setattr(
        grid_pool.project_stores,
        "make_sqlite_store_for_context",
        make_store,
    )
    monkeypatch.setattr(
        grid_pool.pool_indexer,
        "compute_beat_content_hash",
        lambda _beat, sketch_colors: "current-hash",
    )
    monkeypatch.setattr(
        grid_pool.pool_indexer,
        "is_pool_image_stale",
        lambda _image, beat_hashes, _script_mt: beat_hashes == {1: "current-hash"},
    )
    monkeypatch.setattr(
        grid_pool.pool_indexer,
        "save_pool_index",
        lambda *_args, **_kwargs: pytest.fail("过期草图不应保存索引"),
    )

    with pytest.raises(GridPoolImageStale, match="该草图已过期"):
        await LocalGridPoolGateway().select(
            _context(tmp_path),
            SelectGridPoolImageCommand(
                episode_num=2,
                beat_num=5,
                pool_id="stale-sketch",
            ),
        )

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
