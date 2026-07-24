"""HTTP audio generation must use the IndexTTS2 dispatcher."""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

pytestmark = pytest.mark.m04


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


def _patch_generation_celery(
    monkeypatch,
    generation,
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

    async def fake_resolve_generation_project(
        project_arg, user, required_role="editor"
    ):
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
        generation, "_resolve_generation_project", fake_resolve_generation_project
    )
    monkeypatch.setattr(
        generation, "make_sqlite_store_for_context", fake_make_sqlite_store_for_context
    )
    monkeypatch.setattr(
        project_stores,
        "make_sqlite_store_for_context",
        fake_make_sqlite_store_for_context,
    )

    async def no_prerequisite_errors(**_kwargs):
        return []

    monkeypatch.setattr(
        episode_audio,
        "collect_indextts2_voice_prereq_errors",
        no_prerequisite_errors,
    )
    return ctx


def _patch_audio_task_backend(monkeypatch, generation, backend) -> None:
    from ai_anime import ports

    def provider():
        return backend

    monkeypatch.setattr(generation, "get_task_backend", provider)
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
    from ai_anime.api.routes import generation
    from ai_anime.api.schemas import TTSGenerateRequest

    calls = []
    ctx = _patch_generation_celery(monkeypatch, generation, tmp_path, _FakeStore())
    _patch_audio_task_backend(
        monkeypatch,
        generation,
        SimpleNamespace(enqueue_project_task=_fake_enqueue(calls)),
    )

    response = await generation.generate_audio(
        project="demo",
        episode_num=3,
        body=TTSGenerateRequest(mode="redo_selected", beat_numbers=[2]),
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
            },
        }
    ]


def test_audio_generate_http_route_dispatches_indextts2(monkeypatch, tmp_path):
    from ai_anime.api.routes import generation

    calls = []

    app = FastAPI()
    app.include_router(generation.router)
    app.dependency_overrides[generation.get_api_user] = lambda: {"username": "alice"}

    _patch_generation_celery(monkeypatch, generation, tmp_path, _FakeStore())
    _patch_audio_task_backend(
        monkeypatch,
        generation,
        SimpleNamespace(enqueue_project_task=_fake_enqueue(calls)),
    )

    client = TestClient(app)
    response = client.post(
        "/projects/demo/episodes/3/audio/generate",
        json={"mode": "redo_selected", "beat_numbers": [2]},
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
    }


@pytest.mark.asyncio
async def test_single_beat_audio_route_dispatches_indextts2(monkeypatch, tmp_path):
    from ai_anime.api.routes import generation

    calls = []
    ctx = _patch_generation_celery(monkeypatch, generation, tmp_path, _FakeStore())
    _patch_audio_task_backend(
        monkeypatch,
        generation,
        SimpleNamespace(enqueue_project_task=_fake_enqueue(calls)),
    )

    response = await generation.regenerate_beat_audio(
        project="demo",
        episode_num=3,
        beat_num=2,
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
            },
        }
    ]


@pytest.mark.asyncio
async def test_legacy_tts_generate_endpoint_is_gone():
    from ai_anime.api.routes import generation
    from ai_anime.api.schemas import TTSGenerateRequest

    with pytest.raises(HTTPException) as exc:
        await generation.generate_tts(
            project="demo",
            episode_num=3,
            body=TTSGenerateRequest(),
            user={"username": "alice"},
        )

    assert exc.value.status_code == 410
    assert "/audio/generate" in str(exc.value.detail)


@pytest.mark.asyncio
async def test_legacy_tts_preview_endpoint_is_gone():
    from ai_anime.api.routes import generation
    from ai_anime.api.schemas import TTSPreviewRequest

    with pytest.raises(HTTPException) as exc:
        await generation.preview_tts(
            project="demo",
            body=TTSPreviewRequest(text="hello"),
            user={"username": "alice"},
        )

    assert exc.value.status_code == 410
    assert "IndexTTS2" in str(exc.value.detail)


@pytest.mark.asyncio
async def test_legacy_tts_voices_endpoint_is_gone():
    from ai_anime.api.routes import generation

    with pytest.raises(HTTPException) as exc:
        await generation.list_tts_voices(project="demo", user={"username": "alice"})

    assert exc.value.status_code == 410
    assert "IndexTTS2" in str(exc.value.detail)
