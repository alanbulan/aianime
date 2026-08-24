from __future__ import annotations

import base64
import json
import uuid
from pathlib import Path

import httpx
import pytest
import respx
from httpx import Response

from ai_anime.modules.model_usage.public import configure_model_access
from ai_anime.modules.model_usage.public import (
    ModelAudioTransportError,
    write_model_audio_music,
    write_model_audio_speech,
    write_model_audio_voice_design,
)
from ai_anime.modules.model_usage.public import MODE_MIXED


@pytest.fixture(autouse=True)
def _reset_model_access(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AI_ANIME_CLOUD_PROXY_TOKEN", "cloud-proxy-token")
    monkeypatch.setenv("AI_ANIME_CLOUD_PROXY_BASE_URL", "https://gateway.example/v1")
    configure_model_access(
        allows_custom_models=False,
        mode=MODE_MIXED,
        model_assignments=[
            {"modelId": "cloud-audio", "role": "AUDIO_SPEECH"},
            {"modelId": "cloud-audio", "role": "AUDIO_VOICE_CLONE"},
        ],
    )
    yield
    configure_model_access(allows_custom_models=False, mode=MODE_MIXED)


@pytest.mark.asyncio
async def test_music_transport_uses_gateway_music_contract(tmp_path: Path) -> None:
    configure_model_access(
        allows_custom_models=True,
        mode=MODE_MIXED,
        model_assignments=[
            {"modelId": "audio-model", "role": "AUDIO_MUSIC"},
        ],
    )
    with respx.mock(assert_all_called=True) as router:
        route = router.post("https://gateway.example/v1/audio/music/generations").mock(
            return_value=Response(
                200,
                content=b"audio-bytes",
                headers={
                    "content-type": "audio/mpeg",
                    "x-request-id": "req_audio_1",
                },
            )
        )
        output_path = tmp_path / "audio.mp3"
        result = await write_model_audio_music(
            output_path=output_path,
            prompt="quiet piano",
            duration_seconds=30,
            parameters={"force_instrumental": True},
        )

    assert output_path.read_bytes() == b"audio-bytes"
    assert result.request_id == "req_audio_1"
    assert (
        route.calls.last.request.headers["authorization"] == "Bearer cloud-proxy-token"
    )
    idempotency_key = route.calls.last.request.headers["idempotency-key"]
    assert str(uuid.UUID(idempotency_key)) == idempotency_key
    assert json.loads(route.calls.last.request.content) == {
        "model": "audio-model",
        "mode": "MUSIC",
        "prompt": "quiet piano",
        "duration": 30,
        "response_format": "mp3",
        "force_instrumental": True,
    }


@pytest.mark.asyncio
async def test_voice_design_transport_uses_explicit_cloud_selector(
    tmp_path: Path,
) -> None:
    model_id = "QWEN3_TTS_VD_2026_01_26"
    configure_model_access(
        allows_custom_models=False,
        mode=MODE_MIXED,
        model_assignments=[
            {"modelId": model_id, "role": "AUDIO_VOICE_DESIGN"},
        ],
    )
    with respx.mock(assert_all_called=True) as router:
        route = router.post("https://gateway.example/v1/audio/speech").mock(
            return_value=Response(
                200,
                content=b"designed-voice",
                headers={
                    "content-type": "audio/wav",
                    "x-request-id": "req_voice_design_1",
                    "x-voice-id": "qwen_voice_123",
                },
            )
        )
        output_path = tmp_path / "designed.wav"
        result = await write_model_audio_voice_design(
            output_path=output_path,
            model_selector=f"cloud:{model_id}",
            voice_prompt="清澈温暖的青年女声",
            preview_text="你好，这是声线试听。",
            preferred_name="custom_voice",
            language="zh",
            sample_rate=24000,
            response_format="wav",
        )

    assert output_path.read_bytes() == b"designed-voice"
    assert result.request_id == "req_voice_design_1"
    assert result.voice_id == "qwen_voice_123"
    request = route.calls.last.request
    assert request.headers["x-ai-anime-model-role"] == "AUDIO_VOICE_DESIGN"
    assert request.headers["x-ai-anime-model-selector"] == f"cloud:{model_id}"
    assert json.loads(request.content) == {
        "model": model_id,
        "mode": "VOICE_DESIGN",
        "voice_prompt": "清澈温暖的青年女声",
        "preview_text": "你好，这是声线试听。",
        "preferred_name": "custom_voice",
        "language": "zh",
        "sample_rate": 24000,
        "response_format": "wav",
    }


@pytest.mark.asyncio
async def test_audio_transport_keeps_provider_credentials_behind_router(
    tmp_path: Path,
) -> None:
    configure_model_access(
        allows_custom_models=True,
        mode=MODE_MIXED,
        model_assignments=[
            {"modelId": "local-audio", "role": "AUDIO_SPEECH"},
        ],
    )
    encoded = base64.b64encode(b"base64-audio").decode("ascii")
    with respx.mock(assert_all_called=True) as router:
        route = router.post("https://gateway.example/v1/audio/speech").mock(
            return_value=Response(
                200,
                json={"id": "audio_1", "data": [{"b64_json": encoded}]},
            )
        )
        output_path = tmp_path / "audio.mp3"
        result = await write_model_audio_speech(
            output_path=output_path,
            model_role="AUDIO_SPEECH",
            input_text="test",
        )

    assert output_path.read_bytes() == b"base64-audio"
    assert result.response_id == "audio_1"
    assert (
        route.calls.last.request.headers["authorization"] == "Bearer cloud-proxy-token"
    )


@pytest.mark.asyncio
async def test_audio_transport_downloads_json_url(tmp_path: Path) -> None:
    with respx.mock(assert_all_called=True) as router:
        router.post("https://gateway.example/v1/audio/speech").mock(
            return_value=Response(
                200,
                json={
                    "requestId": "req_audio_2",
                    "audio": {"url": "https://cdn.example/audio.mp3"},
                },
            )
        )
        router.get("https://cdn.example/audio.mp3").mock(
            return_value=Response(200, content=b"downloaded-audio")
        )
        output_path = tmp_path / "audio.mp3"
        result = await write_model_audio_speech(
            output_path=output_path,
            model_role="AUDIO_SPEECH",
            input_text="test",
        )

    assert output_path.read_bytes() == b"downloaded-audio"
    assert result.request_id == "req_audio_2"


@pytest.mark.asyncio
async def test_audio_transport_http_error_exposes_safe_context(tmp_path: Path) -> None:
    with respx.mock(assert_all_called=True) as router:
        router.post("https://gateway.example/v1/audio/speech").mock(
            return_value=Response(
                429,
                json={"error": "quota exhausted"},
                headers={"x-request-id": "req_audio_429"},
            )
        )
        with pytest.raises(RuntimeError, match="HTTP 429") as exc_info:
            await write_model_audio_speech(
                output_path=tmp_path / "audio.mp3",
                model_role="AUDIO_SPEECH",
                input_text="secret script text",
                metadata={"emotion_prompt": "private-emotion"},
            )

    message = str(exc_info.value)
    context_text = message.split("context=", 1)[1].split("; body=", 1)[0]
    context = json.loads(context_text)
    assert context["request_id"] == "req_audio_429"
    assert context["input_chars"] == len("secret script text")
    assert context["metadata_keys"] == ["emotion_prompt"]
    assert "secret script text" not in message
    assert "private-emotion" not in message


@pytest.mark.asyncio
async def test_voice_clone_transport_uploads_reference_audio_as_multipart(
    tmp_path: Path,
) -> None:
    reference = base64.b64encode(b"reference-wav").decode("ascii")
    with respx.mock(assert_all_called=True) as router:
        route = router.post("https://gateway.example/v1/audio/speech").mock(
            return_value=Response(
                200,
                content=b"cloned-audio",
                headers={"content-type": "audio/wav"},
            )
        )
        output_path = tmp_path / "clone.wav"
        await write_model_audio_speech(
            output_path=output_path,
            model_role="AUDIO_VOICE_CLONE",
            input_text="clone this line",
            response_format="wav",
            reference_audio=f"data:audio/wav;base64,{reference}",
            emotion_prompt="压低声音，克制但急切",
        )

    assert output_path.read_bytes() == b"cloned-audio"
    request = route.calls.last.request
    assert request.headers["content-type"].startswith("multipart/form-data; boundary=")
    body = request.content
    assert b'name="model"' in body and b"cloud-audio" in body
    assert b'name="mode"' in body and b"VOICE_CLONE" in body
    assert b'name="input"' in body and b"clone this line" in body
    assert b'name="emotion_prompt"' in body
    assert "压低声音，克制但急切".encode() in body
    assert b'name="reference_audio"' in body and b"reference-wav" in body


@pytest.mark.asyncio
async def test_audio_transport_rejects_unassigned_router_role(tmp_path: Path) -> None:
    configure_model_access(
        allows_custom_models=True,
        mode=MODE_MIXED,
        model_assignments=[
            {"modelId": "audio-model", "role": "AUDIO_SPEECH"},
        ],
    )

    with pytest.raises(PermissionError, match="AUDIO_MUSIC"):
        await write_model_audio_music(
            output_path=tmp_path / "audio.mp3",
            prompt="quiet piano",
            duration_seconds=30,
        )


@pytest.mark.asyncio
async def test_audio_transport_rejects_http_200_error_envelope(tmp_path: Path) -> None:
    with respx.mock(assert_all_called=True) as router:
        router.post("https://gateway.example/v1/audio/speech").mock(
            return_value=Response(
                200,
                json={
                    "requestId": "req_audio_protocol",
                    "error": {
                        "code": "provider_failed",
                        "message": "provider rejected audio request",
                    },
                },
            )
        )
        with pytest.raises(ModelAudioTransportError) as exc_info:
            await write_model_audio_speech(
                output_path=tmp_path / "audio.mp3",
                model_role="AUDIO_SPEECH",
                input_text="test",
            )

    assert "protocol error" in str(exc_info.value)
    assert "provider rejected audio request" in str(exc_info.value)
    assert exc_info.value.request_id == "req_audio_protocol"


@pytest.mark.asyncio
async def test_audio_transport_wraps_timeout_without_request_payload(
    tmp_path: Path,
) -> None:
    request = httpx.Request("POST", "https://gateway.example/v1/audio/speech")
    with respx.mock(assert_all_called=True) as router:
        router.post("https://gateway.example/v1/audio/speech").mock(
            side_effect=httpx.ReadTimeout("timed out", request=request)
        )
        with pytest.raises(ModelAudioTransportError, match="timed out") as exc_info:
            await write_model_audio_speech(
                output_path=tmp_path / "audio.mp3",
                model_role="AUDIO_SPEECH",
                input_text="secret script text",
            )

    assert "secret script text" not in str(exc_info.value)


@pytest.mark.asyncio
async def test_audio_transport_rejects_nested_transport_configuration(
    tmp_path: Path,
) -> None:
    with pytest.raises(ValueError, match="transport field base_url"):
        await write_model_audio_speech(
            output_path=tmp_path / "audio.mp3",
            model_role="AUDIO_SPEECH",
            input_text="test",
            metadata={"provider": {"base_url": "https://bypass.example/v1"}},
        )


@pytest.mark.asyncio
async def test_audio_transport_rejects_json_reference_audio_metadata(
    tmp_path: Path,
) -> None:
    with pytest.raises(ValueError, match="JSON reference audio field audio_url"):
        await write_model_audio_speech(
            output_path=tmp_path / "audio.mp3",
            model_role="AUDIO_SPEECH",
            input_text="test",
            metadata={"audio_url": "https://example.test/reference.wav"},
        )
