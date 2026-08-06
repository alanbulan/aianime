from __future__ import annotations

from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient


def _client(monkeypatch, tmp_path):
    from ai_anime.api.routes import production_pool
    from ai_anime.modules.project_workspace.public import ProjectContext

    async def resolve(*args, **kwargs):
        return SimpleNamespace(
            ctx=ProjectContext(
                project_id="proj-demo",
                project_name="demo",
                owner_type="user",
                owner_id="user-admin",
                owner_username="admin",
                requester_user_id="user-admin",
                requester_username="admin",
                requester_principals=(("user", "user-admin"),),
                effective_role="editor",
                home_node_id="local",
                output_dir=tmp_path,
                state_dir=tmp_path / "state",
                runtime_dir=tmp_path / "runtime",
                is_home_node=True,
            )
        )

    monkeypatch.setattr(production_pool, "resolve_project_scope", resolve)

    app = FastAPI()
    app.include_router(production_pool.router)
    app.dependency_overrides[production_pool.get_api_user] = lambda: {
        "username": "admin"
    }
    return TestClient(app)


def test_cut_grid_can_register_render_cells(monkeypatch, tmp_path):
    from ai_anime.modules.generators import pool_indexer

    grids_dir = tmp_path / "grids" / "ep001"
    grids_dir.mkdir(parents=True)
    (grids_dir / "grid_02.png").write_bytes(b"fake image")
    seen = {}

    def _save_grid_and_split(**kwargs):
        seen.update(kwargs)
        return {"added": 2, "skipped": 0}

    monkeypatch.setattr(pool_indexer, "save_grid_and_split", _save_grid_and_split)
    client = _client(monkeypatch, tmp_path)

    response = client.post(
        "/projects/demo/episodes/1/grids/0/cut",
        json={
            "grid_type": "render",
            "rows": 1,
            "cols": 2,
            "beat_start": 5,
            "beat_end": 6,
            "beat_numbers": [5, 6],
        },
    )

    assert response.status_code == 200
    assert response.json()["ok"] is True
    assert seen["grid_type"] == "render"
    assert seen["mode_key"] == "1x2"
    assert seen["beat_nums"] == [5, 6]
    assert seen["promote_dir"] == tmp_path / "frames" / "ep001"


def test_cut_grid_preserves_missing_directory_and_index_errors(monkeypatch, tmp_path):
    client = _client(monkeypatch, tmp_path)
    payload = {
        "grid_type": "render",
        "rows": 1,
        "cols": 1,
        "beat_start": 1,
        "beat_end": 1,
    }

    missing = client.post(
        "/projects/demo/episodes/1/grids/0/cut",
        json=payload,
    )
    (tmp_path / "grids" / "ep001").mkdir(parents=True)
    out_of_range = client.post(
        "/projects/demo/episodes/1/grids/0/cut",
        json=payload,
    )

    assert missing.json() == {
        "ok": False,
        "error": "No grids directory for episode 1",
    }
    assert out_of_range.json() == {
        "ok": False,
        "error": "Grid index 0 out of range (total: 0)",
    }
