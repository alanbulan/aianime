from __future__ import annotations

import uuid

import pytest
import respx
from httpx import Response

from ai_anime.model_access_policy import configure_model_access
from ai_anime.model_text_transport import (
    ModelTextTransportError,
    request_model_chat_content,
)


@pytest.fixture(autouse=True)
def _reset_model_access(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AI_ANIME_CLOUD_PROXY_TOKEN", "cloud-proxy-token")
    monkeypatch.setenv("AI_ANIME_CLOUD_PROXY_BASE_URL", "https://gateway.example/v1")
    configure_model_access(allows_custom_models=False, mode="cloud")
    yield
    configure_model_access(allows_custom_models=False, mode="cloud")


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
            model="cloud-text",
            messages=[{"role": "user", "content": "first"}],
            max_tokens=128,
        )
        second = await request_model_chat_content(
            model="cloud-text",
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
                model="cloud-text",
                messages=[{"role": "user", "content": "secret prompt"}],
                max_tokens=128,
            )

    assert "protocol error" in str(exc_info.value)
    assert "provider rejected text request" in str(exc_info.value)
    assert "secret prompt" not in str(exc_info.value)
    assert exc_info.value.request_id == "req-text-error"


@pytest.mark.asyncio
async def test_text_transport_rejects_unassigned_byok_model() -> None:
    configure_model_access(
        allows_custom_models=True,
        mode="byok",
        byok_base_url="https://models.example/v1",
        model_assignments=[{"modelId": "assigned-text", "role": "TEXT"}],
    )

    with pytest.raises(PermissionError, match="TEXT"):
        await request_model_chat_content(
            model="unassigned-text",
            messages=[{"role": "user", "content": "test"}],
            max_tokens=128,
        )
