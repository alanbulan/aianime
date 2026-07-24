from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from ai_anime.models import NO_CHARACTER_MARKER
from ai_anime.modules.production.application.grid_regeneration import (
    GridRegenerationRejected,
    GridRegenerationTaskReceipt,
    ScheduledGridRegeneration,
)
from ai_anime.modules.production.application.selected_regeneration import (
    ScheduledSelectedRegeneration,
    SelectedRegenerationKind,
    SelectedRegenerationRejected,
    SelectedRegenerationTaskReceipt,
)


class _RenderRegenStore:
    def __init__(self, beats: list[dict] | None = None):
        self.beats = beats or [
            {"beat_number": 1, "narration_segment": "a", "location": "A"},
            {"beat_number": 2, "narration_segment": "b", "location": "B"},
            {"beat_number": 3, "narration_segment": "c", "location": "C"},
        ]

    async def get_beats_as_dicts(self, episode_num: int):
        assert episode_num == 2
        return self.beats

    def get_sketch_colors(self, episode_num: int):
        assert episode_num == 2
        return {"hero_main": "#ffffff"}

    def get_cached_prop(self, prop_id: str):
        return None


def _client(monkeypatch, tmp_path):
    from ai_anime.api.routes import generation

    calls: list[dict] = []

    async def fake_make_sqlite_store(username: str, project: str):
        assert username == "alice"
        assert project == "demo"
        return _RenderRegenStore()

    async def fake_make_sqlite_store_for_context(ctx):
        assert ctx.project_id == "proj"
        return _RenderRegenStore()

    async def fake_resolve_generation_project(
        project: str, user: dict, required_role: str
    ):
        assert project == "demo"
        assert user == {"username": "alice"}
        assert required_role == "editor"
        return SimpleNamespace(
            username="alice",
            project_name="demo",
            project_dir=tmp_path,
            output_dir=str(tmp_path),
            ctx=SimpleNamespace(
                project_id="proj",
                state_dir=tmp_path / "state",
                runtime_dir=tmp_path / "runtime",
            ),
        )

    async def fake_character_map(**_kwargs):
        return {"hero": {"ref_path": ""}}

    async def fake_prop_menu(*args, **kwargs):
        return []

    async def fake_enqueue_project_task(ctx, **kwargs):
        calls.append(kwargs)
        return SimpleNamespace(
            task_state=SimpleNamespace(task_id=f"task-{len(calls)}"),
            backend="celery",
            queue=kwargs.get("queue_kind") or "default",
        )

    monkeypatch.setattr(
        generation,
        "get_project_dir",
        lambda username, project: tmp_path,
        raising=False,
    )
    monkeypatch.setattr(
        generation, "_resolve_generation_project", fake_resolve_generation_project
    )
    monkeypatch.setattr(
        generation,
        "get_output_dir",
        lambda username, project: str(tmp_path),
        raising=False,
    )
    monkeypatch.setattr(generation, "load_project_config", lambda username, project: {})
    monkeypatch.setattr(generation, "make_sqlite_store", fake_make_sqlite_store)
    monkeypatch.setattr(
        generation, "make_sqlite_store_for_context", fake_make_sqlite_store_for_context
    )
    generation_context = SimpleNamespace(
        build_character_map=fake_character_map,
        episode_or_none=lambda *_: None,
    )
    monkeypatch.setattr(
        generation,
        "production_generation_context_use_cases",
        lambda *_: generation_context,
    )
    monkeypatch.setattr(
        generation, "_runtime_prop_menu_with_global_props", fake_prop_menu
    )
    monkeypatch.setattr(generation, "render_ai_detection_error", lambda beats: None)
    monkeypatch.setattr(
        generation,
        "get_task_backend",
        lambda: SimpleNamespace(enqueue_project_task=fake_enqueue_project_task),
    )

    app = FastAPI()
    app.include_router(generation.router, prefix="/api/v1")
    app.dependency_overrides[generation.get_api_user] = lambda: {"username": "alice"}

    return TestClient(app), calls


def _client_with_real_detection_guard(monkeypatch, tmp_path, beats: list[dict]):
    from ai_anime.api.routes import generation

    calls: list[dict] = []
    seen_character_map_beats: list[list[int]] = []
    store = _RenderRegenStore(beats)

    async def fake_resolve_generation_project(
        project: str, user: dict, required_role: str
    ):
        assert project == "demo"
        assert user == {"username": "alice"}
        assert required_role == "editor"
        return SimpleNamespace(
            username="alice",
            project_name="demo",
            project_dir=tmp_path,
            output_dir=str(tmp_path),
            ctx=SimpleNamespace(
                project_id="proj",
                state_dir=tmp_path / "state",
                runtime_dir=tmp_path / "runtime",
            ),
        )

    async def fake_make_sqlite_store(username: str, project: str):
        assert username == "alice"
        assert project == "demo"
        return store

    async def fake_make_sqlite_store_for_context(ctx):
        assert ctx.project_id == "proj"
        return store

    async def fake_character_map(*, beats, **_kwargs):
        seen_character_map_beats.append(
            [beat["beat_number"] for beat in beats]
        )
        return {"hero": {"ref_path": ""}}

    async def fake_prop_menu(*args, **kwargs):
        return []

    async def fake_enqueue_project_task(ctx, **kwargs):
        calls.append(kwargs)
        return SimpleNamespace(
            task_state=SimpleNamespace(task_id=f"task-{len(calls)}"),
            backend="celery",
            queue=kwargs.get("queue_kind") or "default",
        )

    monkeypatch.setattr(
        generation, "_resolve_generation_project", fake_resolve_generation_project
    )
    monkeypatch.setattr(generation, "make_sqlite_store", fake_make_sqlite_store)
    monkeypatch.setattr(
        generation, "make_sqlite_store_for_context", fake_make_sqlite_store_for_context
    )
    generation_context = SimpleNamespace(
        build_character_map=fake_character_map,
        episode_or_none=lambda *_: None,
    )
    monkeypatch.setattr(
        generation,
        "production_generation_context_use_cases",
        lambda *_: generation_context,
    )
    monkeypatch.setattr(
        generation, "_runtime_prop_menu_with_global_props", fake_prop_menu
    )
    monkeypatch.setattr(generation, "load_project_config", lambda username, project: {})
    monkeypatch.setattr(
        generation,
        "get_task_backend",
        lambda: SimpleNamespace(enqueue_project_task=fake_enqueue_project_task),
    )

    app = FastAPI()
    app.include_router(generation.router, prefix="/api/v1")
    app.dependency_overrides[generation.get_api_user] = lambda: {"username": "alice"}
    return TestClient(app), calls, seen_character_map_beats


def test_render_selected_regen_returns_scope_and_passes_render_settings(
    monkeypatch,
    tmp_path,
):
    from ai_anime.task_identity import selection_scope
    from ai_anime.api.routes import generation

    client, backend_calls = _client(monkeypatch, tmp_path)
    use_case_calls = []
    expected_scope = selection_scope("1x1_2-3", [3, 1])

    class UseCases:
        async def regenerate(self, context, command):
            use_case_calls.append((context, command))
            return ScheduledSelectedRegeneration(
                kind=SelectedRegenerationKind.RENDER,
                episode_num=2,
                scope=expected_scope,
                receipt=SelectedRegenerationTaskReceipt(
                    task_id="task-1",
                    task_key=(
                        f"task:selected_regen:project:proj:2:{expected_scope}"
                    ),
                    backend="celery",
                    queue="default",
                ),
            )

    monkeypatch.setattr(
        generation,
        "selected_regeneration_use_cases",
        lambda: UseCases(),
    )

    response = client.post(
        "/api/v1/projects/demo/episodes/2/beats/regenerate",
        json={
            "beat_indices": [3, 1],
            "mode_key": "1x1_2-3",
            "image_generation_selection": "newapi_nanobanana2",
            "sketch_aspect_padding": True,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["task_type"] == "selected_regen"
    assert body["scope"] == expected_scope
    assert backend_calls == []
    assert len(use_case_calls) == 1
    command = use_case_calls[0][1]
    assert command.kind is SelectedRegenerationKind.RENDER
    assert command.episode_num == 2
    assert command.beat_indices == (3, 1)
    assert command.mode_key == "1x1_2-3"
    assert command.image_generation_selection == "newapi_nanobanana2"
    assert command.sketch_aspect_padding is True


def test_render_selected_regen_preserves_rejection_envelope(monkeypatch, tmp_path):
    from ai_anime.api.routes import generation

    client, backend_calls = _client(monkeypatch, tmp_path)

    class UseCases:
        async def regenerate(self, _context, _command):
            raise SelectedRegenerationRejected("beat_indices 不能为空")

    monkeypatch.setattr(
        generation,
        "selected_regeneration_use_cases",
        lambda: UseCases(),
    )

    response = client.post(
        "/api/v1/projects/demo/episodes/2/beats/regenerate",
        json={"beat_indices": [], "mode_key": "1x1_2-3"},
    )

    assert response.status_code == 200
    assert response.json() == {"ok": False, "error": "beat_indices 不能为空"}
    assert backend_calls == []


@pytest.mark.m09
def test_render_plan_execute_checks_only_selected_beat_detection(monkeypatch, tmp_path):
    client, calls, seen_character_map_beats = _client_with_real_detection_guard(
        monkeypatch,
        tmp_path,
        [
            {"beat_number": 1, "narration_segment": "a", "detected_identities": []},
            {
                "beat_number": 2,
                "narration_segment": "b",
                "detected_identities": [NO_CHARACTER_MARKER],
            },
        ],
    )

    plan_response = client.post(
        "/api/v1/projects/demo/episodes/2/render/plan",
        json={"beat_indices": [2], "strategy": "naive", "aspect_mode": "9:16"},
    )

    assert plan_response.status_code == 200
    plan_body = plan_response.json()
    assert plan_body["ok"] is True
    plan_data = plan_body["data"]
    assert plan_data["total_beats"] == 1
    assert [entry["beat_numbers"] for entry in plan_data["plan"]] == [[2]]

    execute_response = client.post(
        "/api/v1/projects/demo/episodes/2/render/execute",
        json={
            "plan": plan_data["plan"],
            "plan_hash": plan_data["plan_hash"],
            "input_fingerprint": plan_data["input_fingerprint"],
            "strategy": plan_data["strategy"],
            "aspect_mode": "9:16",
            "beat_indices": [2],
        },
    )

    assert execute_response.status_code == 200
    execute_body = execute_response.json()
    assert execute_body["ok"] is True
    assert calls[0]["payload"]["config"]["selected_beat_numbers"] == [2]
    assert seen_character_map_beats == [[2], [2]]


def test_render_grid_regen_passes_render_settings(monkeypatch, tmp_path):
    from ai_anime.api.routes import generation

    client, backend_calls = _client(monkeypatch, tmp_path)
    use_case_calls = []

    class UseCases:
        async def regenerate(self, context, command):
            use_case_calls.append((context, command))
            return ScheduledGridRegeneration(
                episode_num=2,
                grid_index=0,
                receipt=GridRegenerationTaskReceipt(
                    scope="grid_0",
                    task_id="task-1",
                    task_key="task:grid_regenerate:project:proj:2:grid_0",
                    backend="celery",
                    queue="default",
                ),
            )

    monkeypatch.setattr(
        generation,
        "grid_regeneration_use_cases",
        lambda: UseCases(),
    )

    response = client.post(
        "/api/v1/projects/demo/episodes/2/grids/0/regenerate",
        json={
            "style": "cinematic",
            "model": "nanobanana-pro",
            "scene_grouping": True,
            "character_grouping": False,
            "image_generation_selection": "newapi_nanobanana2",
            "sketch_aspect_padding": True,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["task_type"] == "grid_regenerate"
    assert body["scope"] == "grid_0"
    assert backend_calls == []
    assert len(use_case_calls) == 1
    command = use_case_calls[0][1]
    assert command.episode_num == 2
    assert command.grid_index == 0
    assert command.style == "cinematic"
    assert command.model == "nanobanana-pro"
    assert command.scene_grouping is True
    assert command.character_grouping is False
    assert command.image_generation_selection == "newapi_nanobanana2"
    assert command.sketch_aspect_padding is True


def test_render_grid_regen_preserves_rejection_envelope(monkeypatch, tmp_path):
    from ai_anime.api.routes import generation

    client, backend_calls = _client(monkeypatch, tmp_path)

    class UseCases:
        async def regenerate(self, _context, _command):
            raise GridRegenerationRejected("grid_index=4 超出范围")

    monkeypatch.setattr(
        generation,
        "grid_regeneration_use_cases",
        lambda: UseCases(),
    )

    response = client.post(
        "/api/v1/projects/demo/episodes/2/grids/4/regenerate",
        json={"scene_grouping": True},
    )

    assert response.status_code == 200
    assert response.json() == {
        "ok": False,
        "error": "grid_index=4 超出范围",
    }
    assert backend_calls == []
