"""HTTP audio generation must use the IndexTTS2 dispatcher."""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError

pytestmark = pytest.mark.m04


@pytest.fixture(autouse=True)
def _configured_voice_clone_route():
    from ai_anime.modules.model_usage.public import configure_model_access

    configure_model_access(
        allows_custom_models=False,
        mode="mixed",
        model_assignments=[
            {"modelId": "audio-voice-clone-test", "role": "AUDIO_VOICE_CLONE"},
        ],
    )
    yield
    configure_model_access(allows_custom_models=False, mode="mixed")


def test_episode_audio_request_rejects_removed_tts_fields() -> None:
    from ai_anime.api.routes.production.audio_schemas import (
        EpisodeAudioGenerateRequest,
        EpisodeAudioRegenerateRequest,
    )

    with pytest.raises(ValidationError):
        EpisodeAudioGenerateRequest.model_validate({"provider": "old-provider"})
    with pytest.raises(ValidationError, match="model"):
        EpisodeAudioGenerateRequest.model_validate({"model": "legacy"})
    with pytest.raises(ValidationError, match="model"):
        EpisodeAudioRegenerateRequest.model_validate({"model": "legacy"})


class _FakeStore:
    async def get_beats_as_dicts(self, episode: int):
        assert episode == 3
        return [
            {
                "beat_number": 2,
                "audio_type": "dialogue",
                "narration_segment": "走。",
                "video_prompt": "镜头从角色正面缓慢推近。",
                "seedance2_config_json": '{"final_prompt": "参考图片1，镜头从角色正面缓慢推近。"}',
            }
        ]

    async def close(self) -> None:
        return None


def _patch_audio_celery(
    monkeypatch,
    audio_routes,
    tmp_path,
    store,
    *,
    username="alice",
    project="demo",
):
    """Drive the supported Celery dispatch path (ctx present, task_backend=celery).

    The legacy non-celery branch has been removed, so audio/video dispatch is
    only exercised via Celery.
    """
    from ai_anime.modules.production.infrastructure import episode_audio
    from ai_anime.shared.infrastructure import project_stores

    ctx = SimpleNamespace(
        project_id="proj-1",
        project_name=project,
        owner_username=username,
        output_dir=tmp_path,
        state_dir=tmp_path / "state",
    )

    async def fake_resolve_project_scope(project_arg, user, *, required_role="editor"):
        assert project_arg == project
        assert user["username"] == username
        return SimpleNamespace(
            ctx=ctx,
            username=username,
            project_name=project,
            project_dir=tmp_path,
            output_dir=str(tmp_path),
            state_dir=str(tmp_path / "state"),
            runtime_dir=str(tmp_path / "runtime"),
        )

    async def fake_make_sqlite_store_for_context(ctx_arg):
        assert ctx_arg is ctx
        return store

    monkeypatch.setattr(
        audio_routes,
        "resolve_project_scope",
        fake_resolve_project_scope,
    )
    monkeypatch.setattr(
        project_stores,
        "make_sqlite_store_for_context",
        fake_make_sqlite_store_for_context,
    )

    async def exact_audio_plan(**kwargs):
        return SimpleNamespace(
            beat_numbers=list(kwargs.get("beat_numbers") or [2]),
            errors=[],
            billable_chars=2,
        )

    monkeypatch.setattr(
        episode_audio,
        "build_indextts2_audio_generation_plan",
        exact_audio_plan,
    )
    return ctx


def _patch_audio_task_backend(monkeypatch, backend) -> None:
    from ai_anime.shared import ports

    def provider():
        return backend

    monkeypatch.setattr(ports, "get_task_backend", provider)


def _fake_enqueue(calls):
    async def fake_enqueue_project_task(
        ctx, *, task_type, queue_kind, episode, payload, **extra
    ):
        calls.append(
            {
                "ctx": ctx,
                "task_type": task_type,
                "episode": episode,
                "payload": payload,
                **extra,
            }
        )
        return SimpleNamespace(
            task_state=SimpleNamespace(task_id="task-1"),
            backend="celery",
            queue="default",
        )

    return fake_enqueue_project_task


@pytest.mark.asyncio
async def test_audio_generate_route_dispatches_indextts2(monkeypatch, tmp_path):
    from ai_anime.api.routes.production.audio_schemas import EpisodeAudioGenerateRequest
    from ai_anime.api.routes.production import audio as production_audio

    calls = []
    ctx = _patch_audio_celery(monkeypatch, production_audio, tmp_path, _FakeStore())
    _patch_audio_task_backend(
        monkeypatch,
        SimpleNamespace(enqueue_project_task=_fake_enqueue(calls)),
    )

    response = await production_audio.generate_audio(
        project="demo",
        episode_num=3,
        body=EpisodeAudioGenerateRequest(
            mode="redo_selected",
            beat_numbers=[2],
        ),
        user={"username": "alice"},
    )

    assert response["ok"] is True
    assert response["task_type"] == "audio_generation_indextts2"
    assert calls == [
        {
            "ctx": ctx,
            "task_type": "audio_generation_indextts2",
            "episode": 3,
            "payload": {
                "episode": 3,
                "mode": "redo_selected",
                "beat_numbers": [2],
                "output_dir": str(tmp_path),
                "state_dir": str(tmp_path / "state"),
                "billing": {
                    "pricing_kind": "audio",
                    "pricing_model": "audio-voice-clone-test",
                    "pricing_params": {},
                    "pricing_quantity": 1,
                    "pricing_metrics": {
                        "call_count": 1,
                        "item_count": 1,
                        "billable_chars": 2,
                    },
                    "items": 1,
                    "beat_numbers": [2],
                },
            },
        }
    ]


def test_audio_generate_http_route_dispatches_indextts2(monkeypatch, tmp_path):
    from ai_anime.api.routes.production import audio as production_audio

    calls = []

    app = FastAPI()
    app.include_router(production_audio.router)
    app.dependency_overrides[production_audio.get_api_user] = lambda: {
        "username": "alice"
    }

    _patch_audio_celery(monkeypatch, production_audio, tmp_path, _FakeStore())
    _patch_audio_task_backend(
        monkeypatch,
        SimpleNamespace(enqueue_project_task=_fake_enqueue(calls)),
    )

    client = TestClient(app)
    response = client.post(
        "/projects/demo/episodes/3/audio/generate",
        json={
            "mode": "redo_selected",
            "beat_numbers": [2],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["task_type"] == "audio_generation_indextts2"
    assert body["message"] == "第 3 集语音批量生成已进入队列"
    assert calls[0]["task_type"] == "audio_generation_indextts2"
    assert calls[0]["payload"] == {
        "episode": 3,
        "mode": "redo_selected",
        "beat_numbers": [2],
        "output_dir": str(tmp_path),
        "state_dir": str(tmp_path / "state"),
        "billing": {
            "pricing_kind": "audio",
            "pricing_model": "audio-voice-clone-test",
            "pricing_params": {},
            "pricing_quantity": 1,
            "pricing_metrics": {
                "call_count": 1,
                "item_count": 1,
                "billable_chars": 2,
            },
            "items": 1,
            "beat_numbers": [2],
        },
    }


@pytest.mark.asyncio
async def test_single_beat_audio_route_dispatches_indextts2(monkeypatch, tmp_path):
    from ai_anime.api.routes.production.audio_schemas import EpisodeAudioRegenerateRequest
    from ai_anime.api.routes.production import audio as production_audio

    calls = []
    ctx = _patch_audio_celery(monkeypatch, production_audio, tmp_path, _FakeStore())
    _patch_audio_task_backend(
        monkeypatch,
        SimpleNamespace(enqueue_project_task=_fake_enqueue(calls)),
    )

    response = await production_audio.regenerate_beat_audio(
        project="demo",
        episode_num=3,
        beat_num=2,
        body=EpisodeAudioRegenerateRequest(),
        user={"username": "alice"},
    )

    assert response["ok"] is True
    assert response["task_type"] == "audio_generation_indextts2"
    assert response["message"] == "第 3 集 Beat 2 语音生成已进入队列"
    assert calls == [
        {
            "ctx": ctx,
            "task_type": "audio_generation_indextts2",
            "episode": 3,
            "payload": {
                "episode": 3,
                "mode": "redo_selected",
                "beat_numbers": [2],
                "output_dir": str(tmp_path),
                "state_dir": str(tmp_path / "state"),
                "billing": {
                    "pricing_kind": "audio",
                    "pricing_model": "audio-voice-clone-test",
                    "pricing_params": {},
                    "pricing_quantity": 1,
                    "pricing_metrics": {
                        "call_count": 1,
                        "item_count": 1,
                        "billable_chars": 2,
                    },
                    "items": 1,
                    "beat_numbers": [2],
                },
            },
        }
    ]


def test_removed_tts_routes_are_not_registered():
    from ai_anime.api.routes.production import audio as production_audio

    app = FastAPI()
    app.include_router(production_audio.router)
    client = TestClient(app)

    assert client.post("/projects/demo/episodes/3/tts/generate", json={}).status_code == 404
    assert client.post("/projects/demo/tts/preview", json={"text": "hello"}).status_code == 404
    assert client.get("/projects/demo/tts/voices").status_code == 404
