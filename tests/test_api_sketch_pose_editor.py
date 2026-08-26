from __future__ import annotations

from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image
import pytest


class _PoseStore:
    def __init__(self) -> None:
        self.close_calls = 0

    async def get_beats_as_dicts(self, episode_num: int):
        assert episode_num == 1
        return [
            {
                "beat_number": 1,
                "visual_description": "Hero_Main stands",
                "detected_identities": ["Hero_Main"],
            }
        ]

    def get_sketch_colors(self, episode_num: int):
        assert episode_num == 1
        return {"Hero_Main": "#00ffff CYAN"}

    async def close(self) -> None:
        self.close_calls += 1


def _client(monkeypatch, tmp_path):
    from ai_anime.api.routes.production import sketch as production_sketch
    from ai_anime.modules.production.infrastructure import sketch_editing
    from ai_anime.modules.project_workspace.public import ProjectContext

    context = ProjectContext(
        project_id="proj_demo",
        project_name="demo",
        owner_type="user",
        owner_id="user-alice",
        owner_username="alice",
        requester_user_id="user-alice",
        requester_username="alice",
        requester_principals=(("user", "user-alice"),),
        effective_role="editor",
        home_node_id="local",
        output_dir=tmp_path,
        state_dir=tmp_path / "_state",
        runtime_dir=tmp_path / "_runtime",
        is_home_node=True,
    )
    store = _PoseStore()

    async def fake_resolve_project(
        project: str, user: dict, required_role: str = "editor"
    ):
        return SimpleNamespace(
            ctx=context,
            username="alice",
            project_name="demo",
            project_dir=tmp_path,
            output_dir=str(tmp_path),
            state_dir=str(tmp_path / "_state"),
            runtime_dir=str(tmp_path / "_runtime"),
        )

    async def make_store(candidate):
        assert candidate is context
        return store

    monkeypatch.setattr(production_sketch, "resolve_project_scope", fake_resolve_project)
    monkeypatch.setattr(
        sketch_editing.project_stores,
        "make_sqlite_store_for_context",
        make_store,
    )

    sketch_dir = tmp_path / "sketches" / "ep001"
    sketch_dir.mkdir(parents=True)
    Image.new("RGBA", (64, 96), (255, 255, 255, 255)).save(
        sketch_dir / "beat_01.png",
    )

    app = FastAPI()
    app.include_router(production_sketch.router, prefix="/api/v1")
    app.dependency_overrides[production_sketch.get_api_user] = lambda: {
        "username": "alice"
    }

    return TestClient(app), sketch_dir / "beat_01.png"


def _sketch_url(sketch_path) -> str:
    return (
        "/static/projects/proj_demo/sketches/ep001/beat_01.png"
        f"?v={sketch_path.stat().st_mtime_ns}"
    )


def test_get_sketch_pose_editor_payload(monkeypatch, tmp_path):
    client, sketch_path = _client(monkeypatch, tmp_path)

    response = client.get("/api/v1/projects/demo/episodes/1/beats/1/sketch/pose-editor")

    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["data"]["beat_num"] == 1
    assert body["data"]["sketch_url"] == _sketch_url(sketch_path)
    assert body["data"]["width"] == 64
    assert body["data"]["height"] == 96
    assert body["data"]["candidates"][0]["identity_id"] == "Hero_Main"
    assert "standing_front" in body["data"]["pose_presets"]
    assert body["data"]["skeletons"][0]["identityId"] == "Hero_Main"


def test_save_sketch_pose_editor_state(monkeypatch, tmp_path):
    client, sketch_path = _client(monkeypatch, tmp_path)

    response = client.post(
        "/api/v1/projects/demo/episodes/1/beats/1/sketch/pose-editor",
        json={
            "strokes": [
                {
                    "points": [{"x": 5, "y": 5}, {"x": 30, "y": 30}],
                    "width": 4,
                    "colorHex": "#ff0000",
                }
            ],
            "skeletons": [],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["data"]["sketch_url"] == _sketch_url(sketch_path)
    with Image.open(sketch_path) as saved_image:
        saved = saved_image.convert("RGBA")
        assert saved.getpixel((10, 10))[:3] == (255, 0, 0)


def test_crop_current_sketch_saves_canonical_image(monkeypatch, tmp_path):
    client, sketch_path = _client(monkeypatch, tmp_path)
    Image.new("RGBA", (64, 96), (255, 255, 255, 255)).save(sketch_path)

    response = client.post(
        "/api/v1/projects/demo/episodes/1/beats/1/sketch/crop",
        json={"x": 4, "y": 6, "width": 20, "height": 30},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["data"]["width"] == 20
    assert body["data"]["height"] == 30
    assert body["data"]["sketch_url"] == _sketch_url(sketch_path)
    with Image.open(sketch_path) as cropped:
        assert cropped.size == (20, 30)


@pytest.mark.parametrize(
    ("payload", "error"),
    [
        ({"x": "bad", "y": 0, "width": 20, "height": 30}, "裁剪参数无效"),
        ({"x": 0, "y": 0, "width": 0, "height": 30}, "裁剪宽高必须大于 0"),
    ],
)
def test_crop_current_sketch_preserves_validation_errors(
    monkeypatch,
    tmp_path,
    payload,
    error,
):
    client, _sketch_path = _client(monkeypatch, tmp_path)

    response = client.post(
        "/api/v1/projects/demo/episodes/1/beats/1/sketch/crop",
        json=payload,
    )

    assert response.status_code == 400
    assert response.json() == {"ok": False, "error": error}


def test_sketch_editing_preserves_missing_and_save_errors(monkeypatch, tmp_path):
    client, sketch_path = _client(monkeypatch, tmp_path)
    sketch_path.unlink()

    missing = client.get("/api/v1/projects/demo/episodes/1/beats/1/sketch/pose-editor")
    Image.new("RGBA", (64, 96), (255, 255, 255, 255)).save(sketch_path)
    invalid_save = client.post(
        "/api/v1/projects/demo/episodes/1/beats/1/sketch/pose-editor",
        json={
            "strokes": [
                {
                    "points": [{"x": 5, "y": 5}, {"x": 30, "y": 30}],
                    "colorHex": "invalid",
                }
            ]
        },
    )

    assert missing.status_code == 404
    assert missing.json() == {"ok": False, "error": "Beat 1 缺少当前草图"}
    assert invalid_save.status_code == 400
    assert invalid_save.json()["ok"] is False
    assert invalid_save.json()["error"].startswith("保存草图编辑失败:")
