from __future__ import annotations

import base64
import json
import uuid
from pathlib import Path

import httpx
import pytest
import respx
from httpx import Response

from ai_anime.model_access_policy import configure_model_access
from ai_anime.model_audio_transport import (
    ModelAudioTransportError,
    write_model_audio_speech,
)
from ai_anime.model_gateway_settings import MODE_BYOK, MODE_CLOUD


@pytest.fixture(autouse=True)
def _reset_model_access(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AI_ANIME_CLOUD_PROXY_TOKEN", "cloud-proxy-token")
    monkeypatch.setenv("AI_ANIME_CLOUD_PROXY_BASE_URL", "https://gateway.example/v1")
    configure_model_access(allows_custom_models=False, mode=MODE_CLOUD)
    yield
    configure_model_access(allows_custom_models=False, mode=MODE_CLOUD)


@pytest.mark.asyncio
async def test_audio_transport_uses_selected_byok_and_raw_audio(tmp_path: Path) -> None:
    configure_model_access(
        allows_custom_models=True,
        mode=MODE_BYOK,
        byok_base_url="https://custom.example/v1",
        byok_api_key="sk-custom-secret",
        model_assignments=[
            {"modelId": "audio-model", "role": "AUDIO_MUSIC"},
        ],
    )
    with respx.mock(assert_all_called=True) as router:
        route = router.post("https://custom.example/v1/audio/speech").mock(
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
        result = await write_model_audio_speech(
            output_path=output_path,
            model="audio-model",
            model_role="AUDIO_MUSIC",
            input_text="quiet piano",
        )

    assert output_path.read_bytes() == b"audio-bytes"
    assert result.request_id == "req_audio_1"
    assert route.calls.last.request.headers["authorization"] == "Bearer sk-custom-secret"
    idempotency_key = route.calls.last.request.headers["idempotency-key"]
    assert str(uuid.UUID(idempotency_key)) == idempotency_key


@pytest.mark.asyncio
async def test_audio_transport_supports_keyless_byok_and_base64_json(
    tmp_path: Path,
) -> None:
    configure_model_access(
        allows_custom_models=True,
        mode=MODE_BYOK,
        byok_base_url="http://127.0.0.1:11434/v1",
        byok_api_key="",
        model_assignments=[
            {"modelId": "local-audio", "role": "AUDIO_SPEECH"},
        ],
    )
    encoded = base64.b64encode(b"base64-audio").decode("ascii")
    with respx.mock(assert_all_called=True) as router:
        route = router.post("http://127.0.0.1:11434/v1/audio/speech").mock(
            return_value=Response(
                200,
                json={"id": "audio_1", "data": [{"b64_json": encoded}]},
            )
        )
        output_path = tmp_path / "audio.mp3"
        result = await write_model_audio_speech(
            output_path=output_path,
            model="local-audio",
            model_role="AUDIO_SPEECH",
            input_text="test",
        )

    assert output_path.read_bytes() == b"base64-audio"
    assert result.response_id == "audio_1"
    assert "authorization" not in route.calls.last.request.headers


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
            model="cloud-audio",
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
                model="cloud-audio",
                model_role="AUDIO_VOICE_CLONE",
                input_text="secret script text",
                metadata={"audio_url": "private-reference"},
            )

    message = str(exc_info.value)
    context_text = message.split("context=", 1)[1].split("; body=", 1)[0]
    context = json.loads(context_text)
    assert context["request_id"] == "req_audio_429"
    assert context["input_chars"] == len("secret script text")
    assert context["metadata_keys"] == ["audio_url"]
    assert "secret script text" not in message
    assert "private-reference" not in message


@pytest.mark.asyncio
async def test_audio_transport_rejects_unassigned_byok_role(tmp_path: Path) -> None:
    configure_model_access(
        allows_custom_models=True,
        mode=MODE_BYOK,
        byok_base_url="https://custom.example/v1",
        model_assignments=[
            {"modelId": "audio-model", "role": "AUDIO_SPEECH"},
        ],
    )

    with pytest.raises(PermissionError, match="AUDIO_MUSIC"):
        await write_model_audio_speech(
            output_path=tmp_path / "audio.mp3",
            model="audio-model",
            model_role="AUDIO_MUSIC",
            input_text="quiet piano",
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
                model="cloud-audio",
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
                model="cloud-audio",
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
            model="cloud-audio",
            model_role="AUDIO_SPEECH",
            input_text="test",
            metadata={"provider": {"base_url": "https://bypass.example/v1"}},
        )
