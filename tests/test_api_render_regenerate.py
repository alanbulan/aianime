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
    from ai_anime.api.routes import production_render

    context = object()

    async def fake_resolve_project_scope(
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

    monkeypatch.setattr(
        production_render,
        "resolve_project_scope",
        fake_resolve_project_scope,
    )

    app = FastAPI()
    app.include_router(production_render.router, prefix="/api/v1")
    app.dependency_overrides[production_render.get_api_user] = lambda: {
        "username": "alice"
    }

    return TestClient(app)


def test_render_selected_regen_returns_scope_and_passes_render_settings(
    monkeypatch,
    tmp_path,
):
    from ai_anime.modules.task_execution.public import selection_scope
    from ai_anime.api.routes import production_render

    client = _client(monkeypatch, tmp_path)
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
        production_render,
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
    assert len(use_case_calls) == 1
    command = use_case_calls[0][1]
    assert command.kind is SelectedRegenerationKind.RENDER
    assert command.episode_num == 2
    assert command.beat_indices == (3, 1)
    assert command.mode_key == "1x1_2-3"
    assert command.image_generation_selection == "newapi_nanobanana2"
    assert command.sketch_aspect_padding is True


def test_render_selected_regen_preserves_rejection_envelope(monkeypatch, tmp_path):
    from ai_anime.api.routes import production_render

    client = _client(monkeypatch, tmp_path)

    class UseCases:
        async def regenerate(self, _context, _command):
            raise SelectedRegenerationRejected("beat_indices 不能为空")

    monkeypatch.setattr(
        production_render,
        "selected_regeneration_use_cases",
        lambda: UseCases(),
    )

    response = client.post(
        "/api/v1/projects/demo/episodes/2/beats/regenerate",
        json={"beat_indices": [], "mode_key": "1x1_2-3"},
    )

    assert response.status_code == 200
    assert response.json() == {"ok": False, "error": "beat_indices 不能为空"}


def test_render_plan_and_execute_delegate_request_mapping(monkeypatch, tmp_path):
    from ai_anime.api.routes import production_render

    client = _client(monkeypatch, tmp_path)
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
    monkeypatch.setattr(production_render, "render_plan_use_cases", lambda: use_cases)

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


def test_render_plan_feature_disabled_preserves_503_envelope(monkeypatch, tmp_path):
    from ai_anime.api.routes import production_render

    client = _client(monkeypatch, tmp_path)

    class UseCases:
        def ensure_available(self):
            raise RenderPlanFeatureDisabled

    monkeypatch.setattr(
        production_render,
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


def test_render_plan_rejection_preserves_400_envelope(monkeypatch, tmp_path):
    from ai_anime.api.routes import production_render

    client = _client(monkeypatch, tmp_path)

    class UseCases:
        def ensure_available(self):
            return None

        async def plan(self, _context, _command):
            raise RenderPlanRejected(
                "invalid_beats",
                {"invalid": [3]},
            )

    monkeypatch.setattr(
        production_render,
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


def test_render_grid_regen_passes_render_settings(monkeypatch, tmp_path):
    from ai_anime.api.routes import production_render

    client = _client(monkeypatch, tmp_path)
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
        production_render,
        "grid_regeneration_use_cases",
        lambda: UseCases(),
    )

    response = client.post(
        "/api/v1/projects/demo/episodes/2/grids/0/regenerate",
        json={
            "style": "cinematic",
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
    assert len(use_case_calls) == 1
    command = use_case_calls[0][1]
    assert command.episode_num == 2
    assert command.grid_index == 0
    assert command.style == "cinematic"
    assert command.scene_grouping is True
    assert command.character_grouping is False
    assert command.image_generation_selection == "newapi_nanobanana2"
    assert command.sketch_aspect_padding is True


def test_render_grid_regen_preserves_rejection_envelope(monkeypatch, tmp_path):
    from ai_anime.api.routes import production_render

    client = _client(monkeypatch, tmp_path)

    class UseCases:
        async def regenerate(self, _context, _command):
            raise GridRegenerationRejected("grid_index=4 超出范围")

    monkeypatch.setattr(
        production_render,
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
