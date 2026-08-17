from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

pytestmark = pytest.mark.m03


class _ScriptEpisodeStore:
    def __init__(self, identity_ids: list[str], scene_menu: list[dict] | None = None):
        self.episode = SimpleNamespace(
            identity_ids=identity_ids,
            scene_menu=scene_menu or [],
        )
        self.get_episode_calls: list[int] = []

    def get_episode(self, episode_num: int):
        self.get_episode_calls.append(episode_num)
        return self.episode


def _script_client(
    monkeypatch,
    tmp_path,
    identity_ids: list[str],
    scene_menu: list[dict] | None = None,
):
    from ai_anime.api.routes.narrative_planning import scripts
    from ai_anime.api.deps import ProjectResolution
    from ai_anime.shared.utils.path_resolver import PathResolver

    store = _ScriptEpisodeStore(identity_ids, scene_menu)
    clean_calls = []

    async def fake_make_sqlite_store(username: str, project: str):
        assert username == "alice"
        assert project == "demo"
        return store

    async def fake_resolve_project_scope(project, user, *, required_role="viewer"):
        assert project == "demo"
        assert user == {"username": "alice"}
        return ProjectResolution(
            ctx=None,
            username="alice",
            project_name="demo",
            project_dir=tmp_path,
            output_dir=str(tmp_path),
            state_dir=str(tmp_path / "state"),
            runtime_dir=str(tmp_path / "runtime"),
        )

    def fake_clean_sketches(self):
        clean_calls.append(self)
        return []

    monkeypatch.setattr(scripts, "resolve_project_scope", fake_resolve_project_scope)
    monkeypatch.setattr(scripts, "make_sqlite_store", fake_make_sqlite_store)
    monkeypatch.setattr(PathResolver, "clean_sketches", fake_clean_sketches)

    app = FastAPI()
    app.include_router(scripts.router, prefix="/api/v1")
    app.dependency_overrides[scripts.get_api_user] = lambda: {"username": "alice"}

    return TestClient(app), store, clean_calls


def test_script_generate_requires_identity_plan_before_side_effects(
    monkeypatch, tmp_path
):
    client, store, clean_calls = _script_client(monkeypatch, tmp_path, [])

    response = client.post("/api/v1/projects/demo/episodes/2/script/generate", json={})

    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is False
    assert body["code"] == "identity_plan_required"
    assert body["error"]
    assert store.get_episode_calls == [2]
    assert clean_calls == []


def test_script_generate_starts_script_writer_when_identity_plan_exists(
    monkeypatch, tmp_path
):
    client, store, clean_calls = _script_client(
        monkeypatch,
        tmp_path,
        ["秦_幼年"],
        [{"scene_id": "palace"}],
    )

    response = client.post("/api/v1/projects/demo/episodes/2/script/generate", json={})

    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is False
    assert "project context" in body["error"]
    assert store.get_episode_calls == [2]
    assert len(clean_calls) == 1


def test_script_generate_requires_scene_plan_before_side_effects(monkeypatch, tmp_path):
    client, store, clean_calls = _script_client(monkeypatch, tmp_path, ["秦_幼年"])

    response = client.post("/api/v1/projects/demo/episodes/2/script/generate", json={})

    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is False
    assert body["code"] == "scene_plan_required"
    assert body["error"]
    assert store.get_episode_calls == [2]
    assert clean_calls == []


def test_script_generate_forwards_real_mode_parameters(monkeypatch, tmp_path):
    from ai_anime.api.routes.narrative_planning import scripts

    client, _, _ = _script_client(
        monkeypatch,
        tmp_path,
        ["秦_幼年"],
        [{"scene_id": "palace"}],
    )
    captured: dict[str, object] = {}

    async def fake_start_episode_script_generation(store, **kwargs):
        captured.update(kwargs)
        return SimpleNamespace(
            as_dict=lambda: {
                "task_id": "task_123",
                "task_type": "script_writer",
            }
        )

    monkeypatch.setattr(
        scripts,
        "start_episode_script_generation",
        fake_start_episode_script_generation,
    )

    response = client.post(
        "/api/v1/projects/demo/episodes/2/script/generate",
        json={"rhythm": "duration", "target_duration_total": 180},
    )

    assert response.status_code == 200
    assert response.json()["ok"] is True
    assert captured["script_mode"] == "duration"
    assert captured["target_duration_total"] == 180


def test_pipeline_planning_and_script_steps_use_canonical_task_types():
    from ai_anime.api.routes.task_execution.pipeline import _STEP_MAP

    assert _STEP_MAP["identity_plan"][0] == "identity_planner"
    assert _STEP_MAP["scene_plan"][0] == "episode_scene_planner"
    assert _STEP_MAP["script"][0] == "script_writer"
