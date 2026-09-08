"""Exercise HTTP response validation, including fields FastAPI used to strip."""

from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from ai_anime.api.routes.creative_canvas import video as canvas_video
from ai_anime.api.routes.identity_access.dependencies import get_api_user
from ai_anime.api.routes.production import video as production_video
from ai_anime.modules.creative_canvas.public import CreativeCanvasTaskReceipt
from ai_anime.modules.production.public import EpisodeBeatsMissing


def _client(router):
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    app.dependency_overrides[get_api_user] = lambda: {"username": "alice"}
    return TestClient(app, raise_server_exceptions=False)


def test_canvas_http_response_keeps_full_task_identity(monkeypatch):
    receipt = CreativeCanvasTaskReceipt(
        task_type="freezone_video_compose", job_id="job-1", task_id="run-1",
        task_key="task:compose:project-1:job-1", task_episode=0,
        task_scope="job-1", backend="inline", queue=None,
    )

    async def resolve(*args, **kwargs):
        return SimpleNamespace(ctx=object(), project_dir=Path("project"))

    async def submit(command):
        assert [item.muted for item in command.tracks[0].items] == [True, True]
        assert [item.timeline_start for item in command.tracks[0].items] == [0, 2]
        return receipt

    monkeypatch.setattr(canvas_video, "_resolve_editor_project", resolve)
    monkeypatch.setattr(canvas_video, "creative_canvas_video_processing_use_cases",
                        lambda: SimpleNamespace(start_video_composition=submit))
    with _client(canvas_video.router) as client:
        response = client.post("/api/v1/projects/project-1/freezone/video/compose", json={
            "tracks": [{"track_id": "video", "kind": "video", "items": [
                {"item_id": "first", "source_url": "clip.mp4", "source_end": 2,
                 "timeline_start": 0, "muted": True},
                {"item_id": "repeat", "source_url": "clip.mp4", "source_end": 2,
                 "timeline_start": 2, "muted": True},
            ]}],
        })
    assert response.status_code == 200, response.text
    assert response.json() == {"ok": True, "data": receipt.to_dict()}


@pytest.mark.parametrize("outcome", ["accepted", "rejected", "incomplete"])
def test_production_http_validates_accepted_and_rejected_receipts(monkeypatch, outcome):
    async def resolve(*args, **kwargs):
        return SimpleNamespace(ctx=object())

    async def compose(_context, _command):
        if outcome == "rejected":
            raise EpisodeBeatsMissing(1)
        data = {"task_type": "compose_episode", "task_id": "run-1", "task_key": "key-1",
                "backend": "inline", "queue": None, "message": "queued"}
        if outcome == "incomplete":
            data.pop("task_id")
        return SimpleNamespace(as_dict=lambda: data)

    monkeypatch.setattr(production_video, "resolve_project_scope", resolve)
    monkeypatch.setattr(production_video, "episode_video_use_cases",
                        lambda: SimpleNamespace(compose=compose))
    with _client(production_video.router) as client:
        response = client.post("/api/v1/projects/project-1/episodes/1/videos/compose", json={})
    if outcome == "incomplete":
        assert response.status_code == 500
    else:
        assert response.status_code == 200
        if outcome == "rejected":
            assert response.json() == {"ok": False, "error": "No beats found for episode 1"}
        else:
            assert response.json()["task_id"] == "run-1"
            assert response.json()["task_key"] == "key-1"
