from __future__ import annotations

import base64
from dataclasses import dataclass
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

pytestmark = pytest.mark.m04


@dataclass
class DummyStore:
    project_dir: str

    def get_all_characters(self):
        return []


def _client(monkeypatch, tmp_path):
    from ai_anime.modules.project_workspace.infrastructure import project_config
    from ai_anime.api.routes.project_workspace import projects

    project_dir = tmp_path / "output" / "admin" / "demo"
    project_dir.mkdir(parents=True)
    state_root = tmp_path / "state"
    monkeypatch.setattr(project_config, "STATE_DIR", state_root)

    fake_ctx = SimpleNamespace(
        project_id="demo",
        project_name="demo",
        owner_username="admin",
        owner_project_label="admin/demo",
        requester_user_id="user_admin",
        requester_username="admin",
        output_dir=project_dir,
        state_dir=state_root / "admin" / "demo",
        is_home_node=True,
    )

    async def fake_resolve_project_context(*, user, project_id, required_role="viewer"):
        return fake_ctx

    store = DummyStore(str(project_dir))

    async def fake_make_sqlite_store_for_context(ctx):
        return store

    def fake_make_static_url_for_context(ctx, relative_path, local_path=None):
        return f"/static/admin/demo/{relative_path}"

    monkeypatch.setattr(
        projects, "resolve_project_context", fake_resolve_project_context
    )
    monkeypatch.setattr(
        projects, "make_sqlite_store_for_context", fake_make_sqlite_store_for_context
    )
    monkeypatch.setattr(
        projects, "make_static_url_for_context", fake_make_static_url_for_context
    )

    app = FastAPI()
    app.include_router(projects.router)
    app.dependency_overrides[projects.get_api_user] = lambda: {"username": "admin"}
    return TestClient(app), project_config, project_dir


def test_narrator_voice_upload_persists_project_reference(monkeypatch, tmp_path):
    from ai_anime.api.routes.project_workspace import projects

    client, project_config, project_dir = _client(monkeypatch, tmp_path)
    created: list[dict] = []
    monkeypatch.setattr(
        projects,
        "_create_reusable_voice",
        lambda **kwargs: created.append(kwargs) or {"voice_id": "fv_uploaded"},
    )
    project_config.set_narrator_reference_audio(
        "admin",
        "demo",
        relative_path="",
        sha256="",
    )

    response = client.post(
        "/projects/demo/narrator-voice/upload",
        files={"file": ("voice.wav", b"voice-bytes", "audio/wav")},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["data"]["voice_library_id"] == "fv_uploaded"
    assert payload["data"]["reference_path"] == "assets/narrator/voice.wav"
    assert payload["data"]["reference_url"].startswith(
        "/static/admin/demo/assets/narrator/voice.wav"
    )
    saved = project_config.load_narrator_reference_audio("admin", "demo")
    assert saved["path"] == "assets/narrator/voice.wav"
    assert saved["sha256"]
    assert (project_dir / "assets/narrator/voice.wav").read_bytes() == b"voice-bytes"
    assert created[0]["name"] == "voice"
    assert created[0]["content"] == b"voice-bytes"


def test_narrator_voice_record_accepts_data_url(monkeypatch, tmp_path):
    from ai_anime.api.routes.project_workspace import projects

    client, project_config, project_dir = _client(monkeypatch, tmp_path)
    created: list[dict] = []
    monkeypatch.setattr(
        projects,
        "_create_reusable_voice",
        lambda **kwargs: created.append(kwargs) or {"voice_id": "fv_recorded"},
    )
    encoded = base64.b64encode(b"recorded-voice").decode("ascii")

    response = client.post(
        "/projects/demo/narrator-voice/record",
        json={"data_url": f"data:audio/wav;base64,{encoded}"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["data"]["voice_library_id"] == "fv_recorded"
    assert payload["data"]["reference_path"] == "assets/narrator/voice.wav"
    assert project_config.load_narrator_reference_audio("admin", "demo")["path"] == (
        "assets/narrator/voice.wav"
    )
    assert (project_dir / "assets/narrator/voice.wav").read_bytes() == b"recorded-voice"
    assert created[0]["name"] == "第三人称旁白录音"
    assert created[0]["content"] == b"recorded-voice"


def test_narrator_voice_queues_model_preset_generation(monkeypatch, tmp_path):
    from ai_anime.api.routes.project_workspace import projects

    client, project_config, project_dir = _client(monkeypatch, tmp_path)
    captured: list[object] = []

    async def start_preset_voice(command):
        captured.append(command)
        return SimpleNamespace(
            task_type="freezone_voice_preset",
            task_id="task-preset-1",
            task_key="task:freezone_voice_preset:project_narrator",
            task_scope="project_narrator",
        )

    monkeypatch.setattr(
        projects,
        "creative_canvas_audio_generation_use_cases",
        lambda: SimpleNamespace(
            start_preset_voice=start_preset_voice,
        ),
    )

    response = client.post(
        "/projects/demo/narrator-voice/generate-preset",
        json={
            "name": "Claire",
            "model_selector": "cloud:audio-speech-1",
            "voice": "claire",
            "text": "你好，这是试听文本。",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload == {
        "ok": True,
        "task_type": "freezone_voice_preset",
        "task_id": "task-preset-1",
        "task_key": "task:freezone_voice_preset:project_narrator",
        "scope": "project_narrator",
        "message": "项目解说预设声线生成已进入队列",
    }
    command = captured[0]
    assert command.model_selector == "cloud:audio-speech-1"
    assert command.voice == "claire"
    assert command.text == "你好，这是试听文本。"
    assert command.binding == {"kind": "project_narrator"}
    assert project_config.load_narrator_reference_audio("admin", "demo")["path"] == ""
    assert not (project_dir / "assets/narrator/voice.mp3").exists()


def test_narrator_voice_queues_cloud_voice_design(monkeypatch, tmp_path):
    from ai_anime.api.routes.project_workspace import projects

    client, project_config, project_dir = _client(monkeypatch, tmp_path)
    captured: list[object] = []

    async def start_voice_design(command):
        captured.append(command)
        return SimpleNamespace(
            task_type="freezone_voice_design",
            task_id="task-design-1",
            task_key="task:freezone_voice_design:project_narrator",
            task_scope="project_narrator",
        )

    monkeypatch.setattr(
        projects,
        "creative_canvas_audio_generation_use_cases",
        lambda: SimpleNamespace(
            start_voice_design=start_voice_design,
        ),
    )

    response = client.post(
        "/projects/demo/narrator-voice/design",
        json={
            "name": "温暖解说声线",
            "model_selector": "cloud:QWEN3_TTS_VD_2026_01_26",
            "voice_prompt": "温暖、清晰、克制的女性解说声线",
            "preview_text": "欢迎来到今天的故事。",
            "preferred_name": "custom_voice",
            "language": "zh",
            "sample_rate": 24000,
            "response_format": "wav",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload == {
        "ok": True,
        "task_type": "freezone_voice_design",
        "task_id": "task-design-1",
        "task_key": "task:freezone_voice_design:project_narrator",
        "scope": "project_narrator",
        "message": "项目解说文字声线设计已进入队列",
    }
    command = captured[0]
    assert command.model_selector == "cloud:QWEN3_TTS_VD_2026_01_26"
    assert command.voice_prompt == "温暖、清晰、克制的女性解说声线"
    assert command.preview_text == "欢迎来到今天的故事。"
    assert command.binding == {"kind": "project_narrator"}
    assert project_config.load_narrator_reference_audio("admin", "demo")["path"] == ""
    assert not (project_dir / "assets/narrator/voice.wav").exists()


def test_narrator_voice_binds_account_library_voice(monkeypatch, tmp_path):
    from ai_anime.modules.creative_canvas import public as creative_canvas_public

    client, project_config, project_dir = _client(monkeypatch, tmp_path)
    source = tmp_path / "account-voices/fv_alex.mp3"
    source.parent.mkdir(parents=True)
    source.write_bytes(b"source-voice")
    captured: list[object] = []
    monkeypatch.setattr(
        creative_canvas_public,
        "creative_canvas_audio_library_use_cases",
        lambda: SimpleNamespace(
            get_voice=lambda query: captured.append(query) or source,
        ),
    )

    response = client.post(
        "/projects/demo/narrator-voice/bind",
        json={"voice_id": "fv_alex"},
    )

    assert response.status_code == 200
    assert response.json()["ok"] is True
    assert response.json()["data"]["voice_library_id"] == "fv_alex"
    assert captured[0].voice_id == "fv_alex"
    assert project_config.load_narrator_reference_audio("admin", "demo")["path"] == (
        "assets/narrator/voice.mp3"
    )
    assert (project_dir / "assets/narrator/voice.mp3").read_bytes() == b"source-voice"
    assert client.get("/projects/demo/narrator-voice/sources").status_code == 404
    assert client.post(
        "/projects/demo/narrator-voice/copy",
        json={"source_path": str(source)},
    ).status_code == 404


def test_narrator_voice_delete_renames_file_and_clears_metadata(monkeypatch, tmp_path):
    client, project_config, project_dir = _client(monkeypatch, tmp_path)
    target = project_dir / "assets/narrator/voice.wav"
    target.parent.mkdir(parents=True)
    target.write_bytes(b"voice")
    project_config.set_narrator_reference_audio(
        "admin",
        "demo",
        relative_path="assets/narrator/voice.wav",
        sha256="sha",
    )

    response = client.post("/projects/demo/narrator-voice/delete")

    assert response.status_code == 200
    assert response.json()["ok"] is True
    assert project_config.load_narrator_reference_audio("admin", "demo")["path"] == ""
    assert not target.exists()
    assert list((project_dir / "assets/narrator").glob("voice_*.wav"))
