from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


def _client(monkeypatch, tmp_path, *, scheduled_payload: dict | None = None):
    from ai_anime.api.routes.production import sketch as production_sketch
    from ai_anime.modules.project_workspace.public import ProjectContext

    context = ProjectContext(
        project_id="project-demo",
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
    calls: dict[str, object] = {}

    async def fake_resolve_project_scope(project: str, user: dict, required_role: str):
        calls["resolved"] = (project, user, required_role)
        return SimpleNamespace(ctx=context)

    class FakeUseCases:
        async def schedule(self, candidate_context, command):
            calls["scheduled"] = (candidate_context, command)
            payload = scheduled_payload or {
                "task_type": "ai_identity_detection",
                "task_id": "task-detect-1",
                "task_key": "task:ai_identity_detection:project:project-demo:episode:1",
                "backend": "inline",
                "queue": "default",
                "message": "第 1 集 AI 角色检测已进入队列",
            }
            return SimpleNamespace(as_dict=lambda: payload)

    monkeypatch.setattr(
        production_sketch,
        "resolve_project_scope",
        fake_resolve_project_scope,
    )
    monkeypatch.setattr(
        production_sketch,
        "sketch_marker_detection_task_use_cases",
        lambda: FakeUseCases(),
    )

    app = FastAPI()
    app.include_router(production_sketch.router, prefix="/api/v1")
    app.dependency_overrides[production_sketch.get_api_user] = lambda: {
        "username": "alice"
    }
    return TestClient(app), calls, context


def test_detect_identities_queues_background_task(monkeypatch, tmp_path):
    client, calls, context = _client(monkeypatch, tmp_path)

    response = client.post(
        "/api/v1/projects/demo/episodes/1/sketches/detect-identities"
    )

    assert response.status_code == 200
    assert response.json() == {
        "ok": True,
        "task_type": "ai_identity_detection",
        "task_id": "task-detect-1",
        "task_key": "task:ai_identity_detection:project:project-demo:episode:1",
        "backend": "inline",
        "queue": "default",
        "message": "第 1 集 AI 角色检测已进入队列",
    }
    assert calls["resolved"] == ("demo", {"username": "alice"}, "editor")
    scheduled_context, command = calls["scheduled"]
    assert scheduled_context is context
    assert command.episode_num == 1


@pytest.mark.asyncio
async def test_detection_scheduler_submits_project_task_with_episode_payload():
    from ai_anime.modules.production.application.sketch_marker_detection_task import (
        ScheduleSketchMarkerDetectionCommand,
    )
    from ai_anime.modules.production.infrastructure.sketch_marker_detection_task import (
        TaskExecutionSketchMarkerDetectionScheduler,
    )
    from ai_anime.modules.project_workspace.public import ProjectContext

    context = ProjectContext(
        project_id="project-demo",
        project_name="demo",
        owner_type="user",
        owner_id="user-alice",
        owner_username="alice",
        requester_user_id="user-alice",
        requester_username="alice",
        requester_principals=(("user", "user-alice"),),
        effective_role="editor",
        home_node_id="local",
        output_dir="output",
        state_dir="state",
        runtime_dir="runtime",
        is_home_node=True,
    )
    captured: dict[str, object] = {}

    class Submissions:
        async def submit(self, candidate_context, submission):
            captured["context"] = candidate_context
            captured["submission"] = submission
            return SimpleNamespace(
                task_id="task-detect-2",
                task_key="task-key-detect-2",
                backend="celery",
                queue="default",
            )

    receipt = await TaskExecutionSketchMarkerDetectionScheduler(
        Submissions()
    ).enqueue(context, ScheduleSketchMarkerDetectionCommand(episode_num=3))

    assert captured["context"] is context
    submission = captured["submission"]
    assert submission.task_type == "ai_identity_detection"
    assert submission.episode == 3
    assert submission.payload == {"episode": 3}
    assert receipt.task_id == "task-detect-2"
    assert receipt.backend == "celery"
