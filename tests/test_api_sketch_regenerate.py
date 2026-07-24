from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from ai_anime.modules.production.application.selected_regeneration import (
    ScheduledSelectedRegeneration,
    SelectedRegenerationKind,
    SelectedRegenerationRejected,
    SelectedRegenerationTaskReceipt,
)


def _client(monkeypatch):
    from ai_anime.api.routes import generation

    context = object()

    async def resolve(*_args, **_kwargs):
        return SimpleNamespace(ctx=context)

    monkeypatch.setattr(generation, "_resolve_generation_project", resolve)
    app = FastAPI()
    app.include_router(generation.router, prefix="/api/v1")
    app.dependency_overrides[generation.get_api_user] = lambda: {
        "username": "alice"
    }
    return TestClient(app), context


def test_sketch_selected_regen_maps_request_to_application(monkeypatch):
    from ai_anime.api.routes import generation
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
        generation,
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
    from ai_anime.api.routes import generation

    client, _context = _client(monkeypatch)

    class UseCases:
        async def regenerate(self, _target_context, _command):
            raise SelectedRegenerationRejected("beat_indices 不能为空")

    monkeypatch.setattr(
        generation,
        "selected_regeneration_use_cases",
        lambda: UseCases(),
    )

    response = client.post(
        "/api/v1/projects/demo/episodes/2/sketches/regenerate",
        json={"beat_indices": []},
    )

    assert response.status_code == 200
    assert response.json() == {"ok": False, "error": "beat_indices 不能为空"}
