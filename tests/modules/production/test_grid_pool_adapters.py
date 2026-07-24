from __future__ import annotations

import io
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace

import pytest
from PIL import Image

from ai_anime.generators import pool_indexer
from ai_anime.models import GridEntry, PoolImage, PoolIndex
from ai_anime.modules.production.application.grid_pool import (
    GridPoolImageStale,
    GridPoolSelectionRejected,
    GridPoolUploadRejected,
    PersistGridImageCommand,
    SelectGridPoolImageCommand,
    UploadBeatPoolImageCommand,
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


@pytest.mark.parametrize(
    ("content", "message"),
    [
        (b"", "empty file"),
        (b"not-an-image", "invalid image file"),
    ],
)
def test_upload_rejects_empty_or_invalid_image(
    content: bytes,
    message: str,
    tmp_path: Path,
) -> None:
    with pytest.raises(GridPoolUploadRejected, match=message):
        LocalGridPoolGateway().upload(
            _context(tmp_path),
            UploadBeatPoolImageCommand(
                episode_num=2,
                beat_num=5,
                content=content,
                image_type="sketch",
            ),
        )


def test_upload_promotes_images_and_only_assigns_render(
    tmp_path: Path,
) -> None:
    context = _context(tmp_path)
    buffer = io.BytesIO()
    Image.new("RGB", (8, 8), "white").save(buffer, format="PNG")
    content = buffer.getvalue()
    gateway = LocalGridPoolGateway(
        lambda _context, relative_path, local_path=None: f"/files/{relative_path}"
    )

    sketch = gateway.upload(
        context,
        UploadBeatPoolImageCommand(
            episode_num=2,
            beat_num=5,
            content=content,
            image_type="sketch",
        ),
    )
    render = gateway.upload(
        context,
        UploadBeatPoolImageCommand(
            episode_num=2,
            beat_num=6,
            content=content,
            image_type="render",
        ),
    )

    grids_dir = Path(context.output_dir) / "grids" / "ep002"
    pool = pool_indexer.load_pool_index(grids_dir)
    assert pool is not None
    assert sketch.as_dict()["sketch_url"] == "/files/sketches/ep002/beat_05.png"
    assert render.as_dict()["frame_url"] == "/files/frames/ep002/beat_06.png"
    assert (Path(context.output_dir) / "sketches" / "ep002" / "beat_05.png").is_file()
    assert (Path(context.output_dir) / "frames" / "ep002" / "beat_06.png").is_file()
    assert "5" not in pool.beat_assignments
    assert pool.beat_assignments["6"].startswith("render/beat_06_t")


def test_upload_grid_replaces_scope_and_matching_pool_images(tmp_path: Path) -> None:
    context = _context(tmp_path)
    grids_dir = Path(context.output_dir) / "grids" / "ep002"
    old_grid_path = "scene/render_2x2_old.png"
    pool = PoolIndex(
        episode=2,
        grids=[
            GridEntry(
                type="render",
                mode_key="2x2",
                beat_nums=[5, 6],
                preset="scene",
                grid_path=old_grid_path,
            )
        ],
        images=[
            PoolImage(
                id="matched",
                mode="old",
                grid_index=3,
                cell_index=1,
                grid_path=old_grid_path,
                row=0,
                col=0,
                original_beat=5,
                type="render",
            ),
            PoolImage(
                id="other-beat",
                mode="old",
                grid_index=3,
                cell_index=2,
                grid_path=old_grid_path,
                row=0,
                col=1,
                original_beat=9,
                type="render",
            ),
            PoolImage(
                id="other-type",
                mode="old",
                grid_index=3,
                cell_index=3,
                grid_path=old_grid_path,
                row=1,
                col=0,
                original_beat=5,
                type="sketch",
            ),
        ],
    )
    pool_indexer.save_pool_index(pool, grids_dir)
    gateway = LocalGridPoolGateway(
        lambda _context, relative_path, local_path=None: f"/files/{relative_path}"
    )

    uploaded = gateway.upload_grid(
        context,
        PersistGridImageCommand(
            episode_num=2,
            grid_index=3,
            content=b"uploaded-grid",
            grid_type="render",
            mode_key="2x2",
            beat_numbers=(5, 6),
            extension="jpg",
        ),
    )

    expected_path = "custom/render_2x2_5-6_grid_upload.jpg"
    saved_pool = pool_indexer.load_pool_index(grids_dir)
    assert saved_pool is not None
    saved_entry = saved_pool.find_grid("render", "2x2", [5, 6])
    assert saved_entry is not None
    assert uploaded.as_dict() == {
        "grid_index": 3,
        "grid_type": "render",
        "mode_key": "2x2",
        "beat_numbers": [5, 6],
        "grid_path": expected_path,
        "grid_url": f"/files/grids/ep002/{expected_path}",
    }
    assert (grids_dir / expected_path).read_bytes() == b"uploaded-grid"
    assert saved_entry.grid_path == expected_path
    assert saved_entry.preset == "custom"
    assert saved_entry.generated_at is not None
    assert saved_pool.images[0].grid_path == expected_path
    assert saved_pool.images[0].mode == "2x2"
    assert saved_pool.images[1].grid_path == old_grid_path
    assert saved_pool.images[2].grid_path == old_grid_path


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
