from __future__ import annotations

import io
from datetime import datetime
from pathlib import Path
import os
from types import SimpleNamespace

import pytest
from PIL import Image

from ai_anime.modules.production.infrastructure.media_generation import pool_indexer
from ai_anime.modules.production.application.grid_pool import (
    BuildGridSketchPreviewCommand,
    GridPoolCutRejected,
    GridPoolImageStale,
    GridPoolPromptRejected,
    GridPoolPreviewRejected,
    GridPoolSelectionRejected,
    GridPoolUploadRejected,
    LocateGridPromptQuery,
    PersistGridCutCommand,
    PersistGridImageCommand,
    SelectGridPoolImageCommand,
    UploadBeatPoolImageCommand,
)
from ai_anime.modules.production.infrastructure.grid_pool_models import (
    GridEntry,
    PoolImage,
    PoolIndex,
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


def _configure_state_roots(monkeypatch, tmp_path: Path) -> None:
    from ai_anime.shared.utils import state_index_files

    monkeypatch.setattr(state_index_files, "OUTPUT_DIR", str(tmp_path / "output"))
    monkeypatch.setattr(state_index_files, "STATE_DIR", str(tmp_path / "state"))


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
@pytest.mark.parametrize("hash_version", ["legacy", "v2"])
@pytest.mark.parametrize("change", ["none", "content", "asset"])
async def test_sketch_staleness_agrees_for_candidates_selection_and_workflow(
    tmp_path, monkeypatch, hash_version, change
):
    from ai_anime.shared.utils.path_resolver import canonical_scene_master_path

    context = _context(tmp_path)
    _configure_state_roots(monkeypatch, tmp_path)
    project = Path(context.output_dir)
    beat = {"beat_number": 5, "visual_description": "hero enters", "scene_ref": {"scene_id": "room"}}
    master = canonical_scene_master_path(project, "room")
    cell = project / "grids/ep002/sketch/beat_05.png"
    canonical = project / "sketches/ep002/beat_05.png"
    for path in (master, cell, canonical):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"original")
    base = 1_800_000_000
    os.utime(master, (base, base))
    for path in (cell, canonical):
        os.utime(path, (base + 10, base + 10))
    image = PoolImage(
        id="sketch", mode="1x1", grid_index=1, cell_index=1,
        grid_path="", cell_path="sketch/beat_05.png", row=0, col=0,
        original_beat=5, type="sketch", content_hash=pool_indexer.compute_image_hash(cell),
        beat_content_hash=pool_indexer.compute_beat_content_hash(
            beat, project_dir=project if hash_version == "v2" else None
        ),
    )
    pool_indexer.save_pool_index(PoolIndex(episode=2, images=[image]), project / "grids/ep002")
    if change == "content":
        beat["visual_description"] = "hero leaves"
    elif change == "asset":
        master.write_bytes(b"changed")
        os.utime(master, (base + 20, base + 20))

    async def script_data(_context, _episode):
        return {"beats": [beat]}

    monkeypatch.setattr(LocalGridPoolGateway, "_script_data", staticmethod(script_data))
    gateway = LocalGridPoolGateway(lambda *_args, **_kwargs: "/local/sketch.png")
    expected = change != "none"
    assert (await gateway.list_pool(context, 2)).images[0].stale is expected
    assert (await gateway.sketch_candidates(context, 2, 5)).candidates[0].stale is expected
    assert pool_indexer.stale_canonical_sketch_numbers(project, 2, [beat]) == ([5] if expected else [])
    command = SelectGridPoolImageCommand(episode_num=2, beat_num=5, pool_id="sketch")
    if expected:
        with pytest.raises(GridPoolImageStale):
            await gateway.select(context, command)
        command = SelectGridPoolImageCommand(episode_num=2, beat_num=5, pool_id="sketch", force=True)
    await gateway.select(context, command)
    assert canonical.read_bytes() == cell.read_bytes()


@pytest.mark.asyncio
async def test_list_pool_projects_staleness_urls_and_closes_store(
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
    url_calls: list[tuple[str, Path]] = []

    def load_pool(path):
        loaded_paths.append(path)
        return pool

    async def make_store(candidate):
        assert candidate is context
        return store

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
    listing = await LocalGridPoolGateway(media_url).list_pool(context, 2)

    assert listing is not None
    assert loaded_paths == [grids_dir]
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
    pool.get_image("new").beat_content_hash = "outdated-content"

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


def test_grid_prompt_reads_scoped_file_and_rejects_escaped_path(tmp_path: Path) -> None:
    context = _context(tmp_path)
    grids_dir = Path(context.output_dir) / "grids" / "ep002"
    prompt_path = grids_dir / "custom" / "render_2x2_5-6_prompt.txt"
    prompt_path.parent.mkdir(parents=True)
    prompt_path.write_text("stored prompt", encoding="utf-8")
    pool = PoolIndex(
        episode=2,
        grids=[
            GridEntry(
                type="render",
                mode_key="2x2",
                beat_nums=[5, 6],
                preset="custom",
                grid_path="custom/grid.png",
                prompt_path="custom/render_2x2_5-6_prompt.txt",
            )
        ],
    )
    pool_indexer.save_pool_index(pool, grids_dir)
    gateway = LocalGridPoolGateway()
    query = LocateGridPromptQuery(
        episode_num=2,
        grid_index=1,
        grid_type="render",
        mode_key="2x2",
        beat_numbers=(5, 6),
    )

    prompt = gateway.prompt(context, query)

    assert prompt.as_dict() == {
        "grid_index": 1,
        "grid_type": "render",
        "mode_key": "2x2",
        "beat_numbers": [5, 6],
        "prompt": "stored prompt",
        "prompt_path": "custom/render_2x2_5-6_prompt.txt",
    }

    pool.grids[0].prompt_path = "../outside.txt"
    pool.grids[0].preset = "missing"
    (grids_dir.parent / "outside.txt").write_text("outside", encoding="utf-8")
    pool_indexer.save_pool_index(pool, grids_dir)
    with pytest.raises(GridPoolPromptRejected, match="Prompt file not found"):
        gateway.prompt(context, query)


def test_grid_prompt_and_cut_preserve_missing_storage_errors(tmp_path: Path) -> None:
    context = _context(tmp_path)
    gateway = LocalGridPoolGateway()

    with pytest.raises(GridPoolPromptRejected, match="No pool index found"):
        gateway.prompt(
            context,
            LocateGridPromptQuery(
                episode_num=2,
                grid_index=0,
                grid_type="render",
                mode_key=None,
                beat_numbers=(),
            ),
        )
    with pytest.raises(GridPoolCutRejected, match="No grids directory for episode 2"):
        gateway.cut(
            context,
            PersistGridCutCommand(
                episode_num=2,
                grid_index=0,
                grid_type="render",
                lookup_mode_key=None,
                mode_key="1x1",
                rows=1,
                cols=1,
                beat_numbers=(1,),
            ),
        )


def test_grid_preview_preserves_missing_images_and_path_escape_errors(
    monkeypatch,
    tmp_path: Path,
) -> None:
    from ai_anime.modules.production.infrastructure import grid_pool

    context = _context(tmp_path)
    gateway = LocalGridPoolGateway()
    command = BuildGridSketchPreviewCommand(
        episode_num=2,
        grid_index=1,
        rows=1,
        cols=1,
        beat_numbers=(5,),
    )
    monkeypatch.setattr(
        grid_pool.pool_indexer,
        "build_beat_sketch_paths",
        lambda *_args: {},
    )
    monkeypatch.setattr(
        grid_pool.pool_indexer,
        "load_pool_index",
        lambda *_args: None,
    )

    with pytest.raises(GridPoolPreviewRejected, match="No sketch images found"):
        gateway.preview(context, command)

    monkeypatch.setattr(
        grid_pool.pool_indexer,
        "build_beat_sketch_paths",
        lambda *_args: {5: "sketch.png"},
    )
    monkeypatch.setattr(
        grid_pool.image_grid,
        "crop_sketch_panels",
        lambda *_args, **_kwargs: str(tmp_path / "outside.jpg"),
    )
    with pytest.raises(GridPoolPreviewRejected, match="path escaped"):
        gateway.preview(context, command)


def test_rebuild_pool_uses_episode_directory_and_projects_counts(
    monkeypatch,
    tmp_path: Path,
) -> None:
    from ai_anime.modules.production.infrastructure import grid_pool

    context = _context(tmp_path)
    calls: list[tuple[Path, int]] = []

    def rebuild_pool_index(*, episode_grids_dir, episode):
        calls.append((episode_grids_dir, episode))
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
    assert calls == [(grids_dir, 3)]
    assert rebuilt.as_dict() == {
        "episode": 3,
        "image_count": 2,
        "mode_count": 2,
    }


def test_pool_delete_removes_inactive_files_and_preserves_model_source(
    monkeypatch,
    tmp_path: Path,
) -> None:
    _configure_state_roots(monkeypatch, tmp_path)
    context = _context(tmp_path)
    grids_dir = Path(context.output_dir) / "grids" / "ep002"
    (grids_dir / "render").mkdir(parents=True)
    (grids_dir / "custom").mkdir(parents=True)
    for relative_path, content in (
        ("render/first.png", b"first"),
        ("render/second.png", b"second"),
        ("custom/grid.png", b"grid"),
        ("custom/prompt.txt", b"prompt"),
    ):
        (grids_dir / relative_path).write_bytes(content)
    selector = "byok:provider-1:image-model-lite"
    pool = PoolIndex(
        episode=2,
        modes={"2x1": {"total_cells": 2}},
        grids=[
            GridEntry(
                type="render",
                mode_key="2x1",
                beat_nums=[1, 2],
                grid_path="custom/grid.png",
                prompt_path="custom/prompt.txt",
                model="image-model-lite",
                model_selector=selector,
            )
        ],
        images=[
            PoolImage(
                id="first",
                mode="2x1",
                grid_index=1,
                cell_index=1,
                grid_path="custom/grid.png",
                cell_path="render/first.png",
                row=0,
                col=0,
                original_beat=1,
                type="render",
                model="image-model-lite",
                model_selector=selector,
            ),
            PoolImage(
                id="second",
                mode="2x1",
                grid_index=1,
                cell_index=2,
                grid_path="custom/grid.png",
                cell_path="render/second.png",
                row=0,
                col=1,
                original_beat=2,
                type="render",
                model="image-model-lite",
                model_selector=selector,
            ),
        ],
        beat_assignments={"2": "second"},
    )
    pool_indexer.save_pool_index(pool, grids_dir)

    assert pool_indexer.delete_cell_from_pool(grids_dir, "second") == "assigned"
    assert pool_indexer.delete_cell_from_pool(grids_dir, "first") == "deleted"
    assert not (grids_dir / "render" / "first.png").exists()
    assert (grids_dir / "custom" / "grid.png").exists()

    reloaded = pool_indexer.load_pool_index(grids_dir)
    assert reloaded is not None
    assert reloaded.images[0].model_selector == selector
    reloaded.beat_assignments.clear()
    pool_indexer.save_pool_index(reloaded, grids_dir)

    assert pool_indexer.delete_cell_from_pool(grids_dir, "second") == "deleted"
    assert not (grids_dir / "render" / "second.png").exists()
    assert not (grids_dir / "custom" / "grid.png").exists()
    assert not (grids_dir / "custom" / "prompt.txt").exists()
