from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from ai_anime.modules.production.application.manual_sketch_regeneration import (
    ManualSketchRegenerationRejected,
    ScheduledManualSketchRegeneration,
    ScheduledManualSketchSegment,
)
from ai_anime.modules.production.application.selected_regeneration import (
    ScheduledSelectedRegeneration,
    SelectedRegenerationKind,
    SelectedRegenerationRejected,
    SelectedRegenerationTaskReceipt,
)


def _client(monkeypatch):
    from ai_anime.api.routes import production_render, production_sketch

    context = object()

    async def resolve(*_args, **_kwargs):
        return SimpleNamespace(ctx=context)

    monkeypatch.setattr(production_render, "resolve_project_scope", resolve)
    monkeypatch.setattr(production_sketch, "resolve_project_scope", resolve)
    app = FastAPI()
    app.include_router(production_render.router, prefix="/api/v1")
    app.include_router(production_sketch.router, prefix="/api/v1")
    app.dependency_overrides[production_sketch.get_api_user] = lambda: {
        "username": "alice"
    }
    app.dependency_overrides[production_render.get_api_user] = lambda: {
        "username": "alice"
    }
    return TestClient(app), context


def test_sketch_selected_regen_maps_request_to_application(monkeypatch):
    from ai_anime.api.routes import production_render
    from ai_anime.task_identity import selection_scope

    client, context = _client(monkeypatch)
    calls = []
    scope = selection_scope("1x1_2-3_sketch", [3, 1])

    class UseCases:
        async def regenerate(self, target_context, command):
            calls.append((target_context, command))
            return ScheduledSelectedRegeneration(
                kind=SelectedRegenerationKind.SKETCH,
                episode_num=2,
                scope=scope,
                receipt=SelectedRegenerationTaskReceipt(
                    task_id="task-1",
                    task_key=f"task:sketch_regen:project:proj:2:{scope}",
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
        "/api/v1/projects/demo/episodes/2/sketches/regenerate",
        json={
            "beat_indices": [3, 1],
            "mode_key": "1x1_2-3_sketch",
            "image_generation_selection": "newapi_nanobanana2",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["task_type"] == "sketch_regen"
    assert body["scope"] == scope
    assert len(calls) == 1
    assert calls[0][0] is context
    command = calls[0][1]
    assert command.kind is SelectedRegenerationKind.SKETCH
    assert command.episode_num == 2
    assert command.beat_indices == (3, 1)
    assert command.mode_key == "1x1_2-3_sketch"
    assert command.image_generation_selection == "newapi_nanobanana2"


def test_sketch_selected_regen_preserves_rejection_envelope(monkeypatch):
    from ai_anime.api.routes import production_render

    client, _context = _client(monkeypatch)

    class UseCases:
        async def regenerate(self, _target_context, _command):
            raise SelectedRegenerationRejected("beat_indices 不能为空")

    monkeypatch.setattr(
        production_render,
        "selected_regeneration_use_cases",
        lambda: UseCases(),
    )

    response = client.post(
        "/api/v1/projects/demo/episodes/2/sketches/regenerate",
        json={"beat_indices": []},
    )

    assert response.status_code == 200
    assert response.json() == {"ok": False, "error": "beat_indices 不能为空"}


def test_missing_manual_sketch_regen_maps_request_to_application(monkeypatch):
    from ai_anime.api.routes import production_sketch

    client, context = _client(monkeypatch)
    calls = []

    class UseCases:
        async def generate(self, target_context, command):
            calls.append((target_context, command))
            return ScheduledManualSketchRegeneration(
                episode_num=2,
                segments=(
                    ScheduledManualSketchSegment(
                        beat_numbers=(41, 42),
                        scope="scope-a",
                        receipt=SelectedRegenerationTaskReceipt(
                            task_id="task-1",
                            task_key="task-key-1",
                            backend="celery",
                            queue="default",
                        ),
                    ),
                ),
            )

    monkeypatch.setattr(
        production_sketch,
        "manual_sketch_regeneration_use_cases",
        lambda: UseCases(),
    )

    response = client.post(
        "/api/v1/projects/demo/episodes/2/sketches/generate-missing-manual"
    )

    assert response.status_code == 200
    assert response.json() == {
        "ok": True,
        "task_type": "sketch_regen",
        "data": {
            "dispatched": 1,
            "scopes": ["scope-a"],
            "segments": [[41, 42]],
        },
        "message": "已启动 1 组新增分镜草图生成",
    }
    assert len(calls) == 1
    assert calls[0][0] is context
    assert calls[0][1].episode_num == 2


def test_missing_manual_sketch_regen_preserves_rejection_envelope(monkeypatch):
    from ai_anime.api.routes import production_sketch

    client, _context = _client(monkeypatch)

    class UseCases:
        async def generate(self, _target_context, _command):
            raise ManualSketchRegenerationRejected("第 2 集没有 beats")

    monkeypatch.setattr(
        production_sketch,
        "manual_sketch_regeneration_use_cases",
        lambda: UseCases(),
    )

    response = client.post(
        "/api/v1/projects/demo/episodes/2/sketches/generate-missing-manual"
    )

    assert response.status_code == 200
    assert response.json() == {"ok": False, "error": "第 2 集没有 beats"}
