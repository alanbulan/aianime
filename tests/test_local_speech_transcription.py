from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from ai_anime.api.routes.ai_assistant import speech as speech_route
from ai_anime.api.routes.identity_access.dependencies import get_api_user
from ai_anime.modules.ai_assistant.application.speech_transcription import (
    SpeechTranscript,
    SpeechTranscriptionUnavailable,
)
from ai_anime.modules.ai_assistant.infrastructure.local_speech_transcriber import (
    LocalSpeechTranscriber,
)


class _FakeModel:
    def transcribe(self, path: str, **options):
        assert Path(path).is_file()
        assert options == {
            "language": "zh",
            "beam_size": 3,
            "vad_filter": True,
            "condition_on_previous_text": False,
            "initial_prompt": "以下是普通话的简体中文句子。",
        }
        return (
            iter([SimpleNamespace(text="你好"), SimpleNamespace(text="，世界")]),
            SimpleNamespace(language="zh", duration=1.25),
        )


@pytest.mark.asyncio
async def test_local_speech_transcriber_uses_pinned_model_directory(tmp_path: Path):
    model_dir = tmp_path / "model"
    model_dir.mkdir()
    (model_dir / "model.bin").write_bytes(b"model")
    audio_path = tmp_path / "recording.webm"
    audio_path.write_bytes(b"audio")
    model_factory_calls: list[str] = []

    def model_factory(path: str):
        model_factory_calls.append(path)
        return _FakeModel()

    transcriber = LocalSpeechTranscriber(model_dir, model_factory=model_factory)
    first = await transcriber.transcribe(audio_path, language="zh")
    second = await transcriber.transcribe(audio_path, language="zh")

    assert first.text == "你好，世界"
    assert first.language == "zh"
    assert first.duration_seconds == 1.25
    assert second == first
    assert model_factory_calls == [str(model_dir)]


@pytest.mark.asyncio
async def test_local_speech_transcriber_rejects_missing_model(tmp_path: Path):
    audio_path = tmp_path / "recording.webm"
    audio_path.write_bytes(b"audio")

    with pytest.raises(SpeechTranscriptionUnavailable, match="本地语音模型未安装"):
        await LocalSpeechTranscriber(tmp_path / "missing").transcribe(
            audio_path,
            language="zh",
        )


def test_local_speech_route_removes_the_uploaded_recording(monkeypatch):
    uploaded_path: Path | None = None

    class _FakeTranscription:
        async def transcribe(self, audio_path: Path, *, language: str):
            nonlocal uploaded_path
            uploaded_path = audio_path
            assert audio_path.read_bytes() == b"recorded-audio"
            assert language == "zh"
            return SpeechTranscript("测试文本", "zh", 1.0)

    monkeypatch.setattr(
        speech_route,
        "get_speech_transcription",
        lambda: _FakeTranscription(),
    )
    app = FastAPI()
    app.include_router(speech_route.router)
    app.dependency_overrides[get_api_user] = lambda: {"username": "smoke"}

    response = TestClient(app).post(
        "/chat/speech/transcribe",
        files={"audio": ("recording.webm", b"recorded-audio", "audio/webm")},
    )

    assert response.status_code == 200
    assert response.json() == {
        "ok": True,
        "data": {
            "text": "测试文本",
            "language": "zh",
            "durationSeconds": 1.0,
        },
    }
    assert uploaded_path is not None
    assert not uploaded_path.exists()
