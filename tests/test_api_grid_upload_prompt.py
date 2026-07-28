from __future__ import annotations

import io
from types import SimpleNamespace

from fastapi import FastAPI, UploadFile
from fastapi.testclient import TestClient
import pytest


def _client(monkeypatch, tmp_path):
    from ai_anime.api.routes import production_pool

    async def resolve(*args, **kwargs):
        return SimpleNamespace(
            ctx=SimpleNamespace(project_id="proj_demo", output_dir=tmp_path),
            username="admin",
            project_name="demo",
            project_dir=tmp_path,
            output_dir=str(tmp_path),
        )

    monkeypatch.setattr(production_pool, "resolve_project_scope", resolve)

    app = FastAPI()
    app.include_router(production_pool.router)
    app.dependency_overrides[production_pool.get_api_user] = lambda: {
        "username": "admin"
    }
    return TestClient(app)


def _seed_pool(grids_dir):
    from ai_anime.generators.pool_indexer import save_pool_index
    from ai_anime.models import GridEntry, PoolImage, PoolIndex

    pool = PoolIndex(episode=1)
    pool.grids.append(
        GridEntry(
            type="render",
            mode_key="2x2",
            beat_nums=[5, 6],
            preset="custom",
            grid_path="custom/render_2x2_5-6_grid_old.png",
            prompt_path="custom/render_2x2_5-6_prompt.txt",
        )
    )
    for idx, beat in enumerate([5, 6], start=1):
        pool.images.append(
            PoolImage(
                id=f"beat_{beat:02d}_old_render",
                mode="2x2",
                grid_index=2,
                cell_index=idx,
                grid_path="custom/render_2x2_5-6_grid_old.png",
                cell_path=f"render/beat_{beat:02d}.png",
                row=0,
                col=idx - 1,
                original_beat=beat,
                type="render",
            )
        )
    save_pool_index(pool, grids_dir)


@pytest.mark.asyncio
async def test_grid_pool_routes_delegate_request_mapping(monkeypatch):
    from ai_anime.api.routes import production_pool
    from ai_anime.api.production_pool_schemas import (
        GridCutRequest,
        GridSketchPreviewRequest,
        PoolSelectRequest,
    )
    from ai_anime.modules.production.application.grid_pool import (
        BeatSketchCandidates,
        CutGridCommand,
        CutGridResult,
        GridPrompt,
        GridPromptQuery,
        GridSketchPreview,
        GridSketchPreviewCommand,
        GridPoolListing,
        RebuiltGridPool,
        SelectedGridPoolImage,
        SelectGridPoolImageCommand,
        UploadedGridImage,
        UploadGridImageCommand,
    )

    context = object()
    resolve_calls = []
    use_case_calls = []

    async def resolve(*args, **kwargs):
        resolve_calls.append((args, kwargs))
        return SimpleNamespace(ctx=context)

    class UseCases:
        async def list_pool(self, candidate, episode_num):
            use_case_calls.append(("list", candidate, episode_num))
            return GridPoolListing(
                episode=episode_num,
                modes={"2x2": {"total_cells": 0}},
                images=(),
                beat_assignments={},
            )

        def rebuild(self, candidate, episode_num):
            use_case_calls.append(("rebuild", candidate, episode_num))
            return RebuiltGridPool(
                episode=episode_num,
                image_count=4,
                mode_count=1,
            )

        async def sketch_candidates(self, candidate, episode_num, beat_num):
            use_case_calls.append(
                ("candidates", candidate, episode_num, beat_num)
            )
            return BeatSketchCandidates(
                episode=episode_num,
                beat=beat_num,
                current_sketch_url="/static/current.png",
                candidates=(),
            )

        async def select(self, candidate, command):
            use_case_calls.append(("select", candidate, command))
            return SelectedGridPoolImage(
                beat_num=command.beat_num,
                pool_id=command.pool_id,
                image_type="sketch",
                sketch_url="/static/selected.png",
            )

        def upload_grid(self, candidate, command):
            use_case_calls.append(("upload_grid", candidate, command))
            return UploadedGridImage(
                grid_index=command.grid_index,
                grid_type="render",
                mode_key="2x2",
                beat_numbers=(5, 6),
                grid_path="custom/uploaded-grid.jpg",
                grid_url="/static/uploaded-grid.jpg",
            )

        def prompt(self, candidate, query):
            use_case_calls.append(("prompt", candidate, query))
            return GridPrompt(
                grid_index=query.grid_index,
                grid_type="render",
                mode_key="2x2",
                beat_numbers=(5, 6),
                prompt="stored prompt",
                prompt_path="custom/prompt.txt",
            )

        def cut(self, candidate, command):
            use_case_calls.append(("cut", candidate, command))
            return CutGridResult(grid_index=command.grid_index, added=2, skipped=0)

        def preview(self, candidate, command):
            use_case_calls.append(("preview", candidate, command))
            return GridSketchPreview(
                grid_index=command.grid_index,
                rows=command.rows,
                cols=command.cols,
                beat_numbers=command.beat_numbers,
                preview_path="preview.jpg",
                preview_url="/static/preview.jpg",
            )

    use_cases = UseCases()
    monkeypatch.setattr(production_pool, "resolve_project_scope", resolve)
    monkeypatch.setattr(production_pool, "grid_pool_use_cases", lambda: use_cases)

    listed = await production_pool.list_grids(
        "project-id",
        2,
        user={"username": "admin"},
    )
    rebuilt = await production_pool.rebuild_grids_pool_index(
        "project-id",
        2,
        user={"username": "admin"},
    )
    candidates = await production_pool.get_beat_sketch_candidates(
        "project-id",
        2,
        5,
        user={"username": "admin"},
    )
    selected = await production_pool.select_pool_image(
        "project-id",
        2,
        5,
        PoolSelectRequest(pool_id="pool-5", force=True),
        user={"username": "admin"},
    )
    uploaded = await production_pool.upload_grid(
        "project-id",
        2,
        3,
        file=UploadFile(io.BytesIO(b"grid"), filename="grid.jpeg"),
        grid_type=" render ",
        mode_key=" 2x2 ",
        beat_numbers="[5,6]",
        user={"username": "admin"},
    )
    prompt = await production_pool.export_grid_prompt(
        "project-id",
        2,
        3,
        grid_type=" render ",
        mode_key=" 2x2 ",
        beat_numbers="5,6",
        user={"username": "admin"},
    )
    preview = await production_pool.sketch_grid_preview(
        "project-id",
        2,
        3,
        GridSketchPreviewRequest(
            rows=1,
            cols=2,
            beat_numbers=[5, 6],
        ),
        user={"username": "admin"},
    )
    cut = await production_pool.cut_grid(
        "project-id",
        2,
        3,
        GridCutRequest(
            grid_type="render",
            rows=1,
            cols=2,
            beat_start=5,
            beat_end=6,
            beat_numbers=[5, 6],
        ),
        user={"username": "admin"},
    )

    assert resolve_calls == [
        (
            ("project-id", {"username": "admin"}),
            {"required_role": "viewer"},
        ),
        (
            ("project-id", {"username": "admin"}),
            {"required_role": "editor"},
        ),
        (
            ("project-id", {"username": "admin"}),
            {"required_role": "viewer"},
        ),
        (
            ("project-id", {"username": "admin"}),
            {"required_role": "editor"},
        ),
        (
            ("project-id", {"username": "admin"}),
            {"required_role": "editor"},
        ),
        (
            ("project-id", {"username": "admin"}),
            {"required_role": "viewer"},
        ),
        (
            ("project-id", {"username": "admin"}),
            {"required_role": "viewer"},
        ),
        (
            ("project-id", {"username": "admin"}),
            {"required_role": "editor"},
        ),
    ]
    assert use_case_calls == [
        ("list", context, 2),
        ("rebuild", context, 2),
        ("candidates", context, 2, 5),
        (
            "select",
            context,
            SelectGridPoolImageCommand(
                episode_num=2,
                beat_num=5,
                pool_id="pool-5",
                force=True,
            ),
        ),
        (
            "upload_grid",
            context,
            UploadGridImageCommand(
                episode_num=2,
                grid_index=3,
                filename="grid.jpeg",
                content=b"grid",
                grid_type=" render ",
                mode_key=" 2x2 ",
                beat_numbers="[5,6]",
            ),
        ),
        (
            "prompt",
            context,
            GridPromptQuery(
                episode_num=2,
                grid_index=3,
                grid_type=" render ",
                mode_key=" 2x2 ",
                beat_numbers="5,6",
            ),
        ),
        (
            "preview",
            context,
            GridSketchPreviewCommand(
                episode_num=2,
                grid_index=3,
                rows=1,
                cols=2,
                beat_numbers=(5, 6),
            ),
        ),
        (
            "cut",
            context,
            CutGridCommand(
                episode_num=2,
                grid_index=3,
                grid_type="render",
                mode_key=None,
                rows=1,
                cols=2,
                beat_start=5,
                beat_end=6,
                beat_numbers=(5, 6),
            ),
        ),
    ]
    assert listed == {
        "ok": True,
        "data": {
            "episode": 2,
            "modes": {"2x2": {"total_cells": 0}},
            "images": [],
            "beat_assignments": {},
        },
    }
    assert rebuilt == {
        "ok": True,
        "data": {
            "episode": 2,
            "image_count": 4,
            "mode_count": 1,
        },
    }
    assert candidates == {
        "ok": True,
        "data": {
            "episode": 2,
            "beat": 5,
            "current_sketch_url": "/static/current.png",
            "candidate_count": 0,
            "candidates": [],
        },
    }
    assert selected == {
        "ok": True,
        "data": {
            "beat_num": 5,
            "pool_id": "pool-5",
            "image_type": "sketch",
            "sketch_url": "/static/selected.png",
        },
    }
    assert uploaded == {
        "ok": True,
        "data": {
            "grid_index": 3,
            "grid_type": "render",
            "mode_key": "2x2",
            "beat_numbers": [5, 6],
            "grid_path": "custom/uploaded-grid.jpg",
            "grid_url": "/static/uploaded-grid.jpg",
        },
    }
    assert prompt == {
        "ok": True,
        "data": {
            "grid_index": 3,
            "grid_type": "render",
            "mode_key": "2x2",
            "beat_numbers": [5, 6],
            "prompt": "stored prompt",
            "prompt_path": "custom/prompt.txt",
        },
    }
    assert preview == {
        "ok": True,
        "data": {
            "grid_index": 3,
            "rows": 1,
            "cols": 2,
            "beat_numbers": [5, 6],
            "preview_path": "preview.jpg",
            "preview_url": "/static/preview.jpg",
        },
    }
    assert cut == {
        "ok": True,
        "data": {"grid_index": 3, "added": 2, "skipped": 0},
    }


def test_upload_grid_replaces_pool_grid_path(monkeypatch, tmp_path):
    from ai_anime.generators.pool_indexer import load_pool_index

    grids_dir = tmp_path / "grids" / "ep001"
    (grids_dir / "custom").mkdir(parents=True)
    (grids_dir / "custom" / "render_2x2_5-6_prompt.txt").write_text(
        "stored prompt",
        encoding="utf-8",
    )
    _seed_pool(grids_dir)
    client = _client(monkeypatch, tmp_path)

    response = client.post(
        "/projects/demo/episodes/1/grids/2/upload",
        data={
            "grid_type": "render",
            "mode_key": "2x2",
            "beat_numbers": "5,6",
        },
        files={"file": ("grid.png", b"uploaded-grid", "image/png")},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    grid_path = payload["data"]["grid_path"]
    assert grid_path == "custom/render_2x2_5-6_grid_upload.png"
    assert (grids_dir / grid_path).read_bytes() == b"uploaded-grid"
    assert payload["data"]["grid_url"].startswith(
        f"/static/projects/proj_demo/grids/ep001/{grid_path}"
    )

    pool = load_pool_index(grids_dir)
    assert pool is not None
    assert pool.find_grid("render", "2x2", [5, 6]).grid_path == grid_path
    assert {
        image.grid_path for image in pool.images if image.type == "render" and image.grid_index == 2
    } == {grid_path}


def test_upload_grid_preserves_validation_errors(monkeypatch, tmp_path):
    client = _client(monkeypatch, tmp_path)

    invalid_type = client.post(
        "/projects/demo/episodes/1/grids/2/upload",
        data={"grid_type": "other"},
        files={"file": ("grid.png", b"grid", "image/png")},
    )
    invalid_beats = client.post(
        "/projects/demo/episodes/1/grids/2/upload",
        data={"beat_numbers": "["},
        files={"file": ("grid.png", b"grid", "image/png")},
    )
    empty = client.post(
        "/projects/demo/episodes/1/grids/2/upload",
        files={"file": ("grid.png", b"", "image/png")},
    )

    assert invalid_type.json() == {
        "ok": False,
        "error": "grid_type must be render or sketch",
    }
    assert invalid_beats.json()["ok"] is False
    assert invalid_beats.json()["error"].startswith("invalid beat_numbers:")
    assert empty.json() == {"ok": False, "error": "uploaded file is empty"}


def test_export_grid_prompt_reads_pool_prompt_path(monkeypatch, tmp_path):
    grids_dir = tmp_path / "grids" / "ep001"
    (grids_dir / "custom").mkdir(parents=True)
    (grids_dir / "custom" / "render_2x2_5-6_prompt.txt").write_text(
        "stored render prompt",
        encoding="utf-8",
    )
    _seed_pool(grids_dir)
    client = _client(monkeypatch, tmp_path)

    response = client.get(
        "/projects/demo/episodes/1/grids/2/prompt",
        params={
            "grid_type": "render",
            "mode_key": "2x2",
            "beat_numbers": "5,6",
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "ok": True,
        "data": {
            "grid_index": 2,
            "grid_type": "render",
            "mode_key": "2x2",
            "beat_numbers": [5, 6],
            "prompt": "stored render prompt",
            "prompt_path": "custom/render_2x2_5-6_prompt.txt",
        },
    }


def test_export_grid_prompt_preserves_validation_and_missing_pool_errors(
    monkeypatch,
    tmp_path,
):
    client = _client(monkeypatch, tmp_path)

    invalid_type = client.get(
        "/projects/demo/episodes/1/grids/2/prompt",
        params={"grid_type": "other"},
    )
    invalid_beats = client.get(
        "/projects/demo/episodes/1/grids/2/prompt",
        params={"beat_numbers": "["},
    )
    missing_pool = client.get(
        "/projects/demo/episodes/1/grids/2/prompt",
    )

    assert invalid_type.json() == {
        "ok": False,
        "error": "grid_type must be render or sketch",
    }
    assert invalid_beats.json()["ok"] is False
    assert invalid_beats.json()["error"].startswith("invalid beat_numbers:")
    assert missing_pool.json() == {
        "ok": False,
        "error": "No pool index found. Generate grids first.",
    }


def test_cut_grid_can_use_pool_grid_entry(monkeypatch, tmp_path):
    from ai_anime.generators import pool_indexer

    grids_dir = tmp_path / "grids" / "ep001"
    (grids_dir / "custom").mkdir(parents=True)
    uploaded = grids_dir / "custom" / "render_2x2_5-6_grid_upload.png"
    uploaded.write_bytes(b"uploaded-grid")
    _seed_pool(grids_dir)

    pool = pool_indexer.load_pool_index(grids_dir)
    assert pool is not None
    pool.find_grid("render", "2x2", [5, 6]).grid_path = "custom/render_2x2_5-6_grid_upload.png"
    pool_indexer.save_pool_index(pool, grids_dir)

    seen = {}

    def _save_grid_and_split(**kwargs):
        seen.update(kwargs)
        return {"added": 2, "skipped": 0}

    monkeypatch.setattr(pool_indexer, "save_grid_and_split", _save_grid_and_split)
    client = _client(monkeypatch, tmp_path)

    response = client.post(
        "/projects/demo/episodes/1/grids/2/cut",
        json={
            "grid_type": "render",
            "mode_key": "2x2",
            "rows": 1,
            "cols": 2,
            "beat_start": 5,
            "beat_end": 6,
            "beat_numbers": [5, 6],
        },
    )

    assert response.status_code == 200
    assert response.json()["ok"] is True
    assert seen["grid_image_path"] == str(uploaded)
