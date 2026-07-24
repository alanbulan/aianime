from __future__ import annotations

from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from ai_anime.modules.production.application.grid_regeneration import (
    GridRegenerationRejected,
    GridRegenerationTaskReceipt,
    ScheduledGridRegeneration,
)
from ai_anime.modules.production.application.render_planning import (
    ExecutedRenderPlan,
    PlannedRenderEpisode,
    RenderPlanFeatureDisabled,
    RenderPlanRejected,
)
from ai_anime.modules.production.application.selected_regeneration import (
    ScheduledSelectedRegeneration,
    SelectedRegenerationKind,
    SelectedRegenerationRejected,
    SelectedRegenerationTaskReceipt,
)
from ai_anime.modules.production.domain.render_planning import RenderPlanGrid


def _client(monkeypatch, tmp_path):
    from ai_anime.api.routes import generation

    calls: list[dict] = []
    context = object()

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
            ctx=context,
        )

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
    monkeypatch.setattr(
        generation,
        "get_task_backend",
        lambda: SimpleNamespace(enqueue_project_task=fake_enqueue_project_task),
    )

    app = FastAPI()
    app.include_router(generation.router, prefix="/api/v1")
    app.dependency_overrides[generation.get_api_user] = lambda: {"username": "alice"}

    return TestClient(app), calls


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


def test_render_plan_and_execute_delegate_request_mapping(monkeypatch, tmp_path):
    from ai_anime.api.routes import generation

    client, backend_calls = _client(monkeypatch, tmp_path)
    use_case_calls = []
    grid = RenderPlanGrid(
        mode_key="1x1_2-3",
        rows=1,
        cols=1,
        beat_numbers=(2,),
    )

    class UseCases:
        def ensure_available(self):
            use_case_calls.append(("available",))

        async def plan(self, context, command):
            use_case_calls.append(("plan", context, command))
            return PlannedRenderEpisode(
                plan=(grid,),
                plan_hash="plan-hash",
                input_fingerprint="fingerprint",
                strategy="naive",
                total_beats=1,
            )

        async def execute(self, context, command):
            use_case_calls.append(("execute", context, command))
            return ExecutedRenderPlan(
                plan=(grid,),
                scope="naive__plan-hash",
                task_ids=("task-1",),
            )

    use_cases = UseCases()
    monkeypatch.setattr(generation, "render_plan_use_cases", lambda: use_cases)

    plan_response = client.post(
        "/api/v1/projects/demo/episodes/2/render/plan",
        json={
            "beat_indices": [2],
            "strategy": "naive",
            "aspect_mode": "9:16",
            "force_one_by_one": True,
            "image_generation_selection": "newapi_nanobanana2",
        },
    )

    assert plan_response.status_code == 200
    plan_body = plan_response.json()
    assert plan_body["ok"] is True
    plan_data = plan_body["data"]
    assert plan_data["total_beats"] == 1
    assert [entry["beat_numbers"] for entry in plan_data["plan"]] == [[2]]
    plan_command = use_case_calls[1][2]
    assert plan_command.episode_num == 2
    assert plan_command.beat_numbers == (2,)
    assert plan_command.strategy == "naive"
    assert plan_command.aspect_mode == "9:16"
    assert plan_command.force_one_by_one is True
    assert plan_command.image_generation_selection == "newapi_nanobanana2"

    execute_response = client.post(
        "/api/v1/projects/demo/episodes/2/render/execute",
        json={
            "plan": plan_data["plan"],
            "plan_hash": plan_data["plan_hash"],
            "input_fingerprint": plan_data["input_fingerprint"],
            "strategy": plan_data["strategy"],
            "aspect_mode": "9:16",
            "beat_indices": [2],
            "custom_plan": True,
            "sketch_aspect_padding": True,
        },
    )

    assert execute_response.status_code == 200
    execute_body = execute_response.json()
    assert execute_body["ok"] is True
    assert execute_body["data"]["task_ids"] == ["task-1"]
    execute_command = use_case_calls[3][2]
    assert execute_command.episode_num == 2
    assert execute_command.plan == (grid,)
    assert execute_command.plan_hash == "plan-hash"
    assert execute_command.input_fingerprint == "fingerprint"
    assert execute_command.beat_numbers == (2,)
    assert execute_command.custom_plan is True
    assert execute_command.sketch_aspect_padding is True
    assert backend_calls == []


def test_render_plan_feature_disabled_preserves_503_envelope(monkeypatch, tmp_path):
    from ai_anime.api.routes import generation

    client, backend_calls = _client(monkeypatch, tmp_path)

    class UseCases:
        def ensure_available(self):
            raise RenderPlanFeatureDisabled

    monkeypatch.setattr(
        generation,
        "render_plan_use_cases",
        lambda: UseCases(),
    )

    response = client.post(
        "/api/v1/projects/demo/episodes/2/render/plan",
        json={"beat_indices": [2], "strategy": "naive", "aspect_mode": "9:16"},
    )

    assert response.status_code == 503
    assert response.json() == {
        "ok": False,
        "error": "feature_disabled",
        "data": {"reason": "DISABLE_RENDER_PLAN_V2 is set"},
    }
    assert backend_calls == []


def test_render_plan_rejection_preserves_400_envelope(monkeypatch, tmp_path):
    from ai_anime.api.routes import generation

    client, backend_calls = _client(monkeypatch, tmp_path)

    class UseCases:
        def ensure_available(self):
            return None

        async def plan(self, _context, _command):
            raise RenderPlanRejected(
                "invalid_beats",
                {"invalid": [3]},
            )

    monkeypatch.setattr(
        generation,
        "render_plan_use_cases",
        lambda: UseCases(),
    )

    response = client.post(
        "/api/v1/projects/demo/episodes/2/render/plan",
        json={"beat_indices": [3], "strategy": "naive", "aspect_mode": "9:16"},
    )

    assert response.status_code == 400
    assert response.json() == {
        "ok": False,
        "error": "invalid_beats",
        "data": {"invalid": [3]},
    }
    assert backend_calls == []


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
