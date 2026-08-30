from __future__ import annotations

import uuid

import pytest
import respx
from httpx import Response

from ai_anime.modules.model_usage.public import configure_model_access
from ai_anime.modules.model_usage.public import (
    ModelTextTransportError,
    model_protocol_error_message,
    request_model_chat_content,
)


@pytest.fixture(autouse=True)
def _reset_model_access(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AI_ANIME_CLOUD_PROXY_TOKEN", "cloud-proxy-token")
    monkeypatch.setenv("AI_ANIME_CLOUD_PROXY_BASE_URL", "https://gateway.example/v1")
    configure_model_access(
        allows_custom_models=False,
        mode="mixed",
        model_assignments=[{"modelId": "cloud-text", "role": "TEXT"}],
    )
    yield
    configure_model_access(allows_custom_models=False, mode="mixed")


@pytest.mark.parametrize(
    ("payload", "expected"),
    [
        ({"error": {"message": "provider rejected"}}, "provider rejected"),
        ({"error": {"code": "provider_failed"}}, "provider_failed"),
        ({"error": "plain failure"}, "plain failure"),
        ({"status": "failed", "message": "task failed"}, "task failed"),
        ({"status": "ok"}, ""),
        (None, ""),
    ],
)
def test_model_protocol_error_message_has_one_shared_shape(
    payload: object,
    expected: str,
) -> None:
    assert model_protocol_error_message(payload) == expected


@pytest.mark.parametrize(
    ("payload", "fallback", "expected"),
    [
        ({"message": "provider rejected"}, "HTTP 400", "provider rejected"),
        ({"detail": "invalid request"}, "HTTP 422", "invalid request"),
        ({"fail_reason": "generation failed"}, "视频生成失败", "generation failed"),
        ({}, "HTTP 500", "HTTP 500"),
        (None, "transport failed", "transport failed"),
    ],
)
def test_model_protocol_error_message_supports_error_context_fallbacks(
    payload: object,
    fallback: str,
    expected: str,
) -> None:
    assert model_protocol_error_message(payload, fallback) == expected


@pytest.mark.asyncio
async def test_text_transport_uses_one_new_idempotency_key_per_operation() -> None:
    with respx.mock(assert_all_called=True) as router:
        route = router.post("https://gateway.example/v1/chat/completions").mock(
            return_value=Response(
                200,
                json={
                    "choices": [
                        {
                            "message": {
                                "content": [
                                    {"type": "output_text", "text": "answer"},
                                ]
                            }
                        }
                    ]
                },
            )
        )
        first = await request_model_chat_content(
            messages=[{"role": "user", "content": "first"}],
            max_tokens=128,
        )
        second = await request_model_chat_content(
            messages=[{"role": "user", "content": "second"}],
            max_tokens=128,
        )

    assert first == "answer"
    assert second == "answer"
    first_key = route.calls[0].request.headers["idempotency-key"]
    second_key = route.calls[1].request.headers["idempotency-key"]
    assert str(uuid.UUID(first_key)) == first_key
    assert str(uuid.UUID(second_key)) == second_key
    assert first_key != second_key
    assert route.calls[0].request.headers["authorization"] == "Bearer cloud-proxy-token"
    payload = route.calls[0].request.content.decode("utf-8")
    assert "cloud-proxy-token" not in payload


@pytest.mark.asyncio
async def test_text_transport_rejects_http_200_error_envelope() -> None:
    with respx.mock(assert_all_called=True) as router:
        router.post("https://gateway.example/v1/chat/completions").mock(
            return_value=Response(
                200,
                headers={"x-request-id": "req-text-error"},
                json={
                    "error": {
                        "code": "provider_failed",
                        "message": "provider rejected text request",
                    }
                },
            )
        )
        with pytest.raises(ModelTextTransportError) as exc_info:
            await request_model_chat_content(
                messages=[{"role": "user", "content": "secret prompt"}],
                max_tokens=128,
            )

    assert "protocol error" in str(exc_info.value)
    assert "provider rejected text request" in str(exc_info.value)
    assert "secret prompt" not in str(exc_info.value)
    assert exc_info.value.request_id == "req-text-error"


@pytest.mark.asyncio
async def test_text_transport_uses_current_router_assignment() -> None:
    configure_model_access(
        allows_custom_models=True,
        mode="mixed",
        model_assignments=[{"modelId": "assigned-text", "role": "TEXT"}],
    )

    with respx.mock(assert_all_called=True) as router:
        route = router.post("https://gateway.example/v1/chat/completions").mock(
            return_value=Response(
                200,
                json={"choices": [{"message": {"content": "ok"}}]},
            )
        )
        result = await request_model_chat_content(
            messages=[{"role": "user", "content": "test"}],
            max_tokens=128,
        )

    assert result == "ok"
    assert route.calls.last.request.headers["x-ai-anime-model-role"] == "TEXT"
    assert b'"model":"assigned-text"' in route.calls.last.request.content
