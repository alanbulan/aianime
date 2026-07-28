import pytest

from ai_anime.modules.ai_assistant.infrastructure import HttpDisplayFallbackGateway
from ai_anime.modules.ai_assistant.infrastructure import (
    display_fallback_gateway as gateway_module,
)


class FakeResponse:
    def __init__(self, body):
        self.body = body

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return None

    def read(self):
        return self.body


@pytest.mark.parametrize(
    ("api_url", "expected"),
    [
        (None, "http://127.0.0.1:8780/api/v1/config"),
        ("http://localhost:7860", "http://localhost:7860/api/v1/config"),
    ],
)
def test_http_display_fallback_gateway_resolves_backend_url(
    monkeypatch,
    api_url,
    expected,
):
    seen = {}

    def fake_urlopen(request, timeout):
        seen["request"] = request
        seen["timeout"] = timeout
        return FakeResponse(b'{"ok":true}')

    if api_url is None:
        monkeypatch.delenv("AI_ANIME_API_URL", raising=False)
    else:
        monkeypatch.setenv("AI_ANIME_API_URL", api_url)
    monkeypatch.setenv("AI_ANIME_API_PORT", "8780")
    monkeypatch.setattr(gateway_module, "urlopen", fake_urlopen)

    result = HttpDisplayFallbackGateway().get("/api/v1/config", "token")

    assert result == {"ok": True}
    assert seen["request"].full_url == expected
    assert seen["request"].get_header("Authorization") == "Bearer token"
    assert seen["request"].get_header("User-agent") == ("ai-anime-chat-fallback/0.1.0")
    assert seen["timeout"] == 30


@pytest.mark.parametrize(
    ("body", "expected"),
    [
        (b"[1,2]", {"ok": True, "data": [1, 2]}),
        (b"not-json", {"ok": False, "error": "not-json"}),
    ],
)
def test_http_display_fallback_gateway_normalizes_response(
    monkeypatch,
    body,
    expected,
):
    monkeypatch.setattr(
        gateway_module,
        "urlopen",
        lambda request, timeout: FakeResponse(body),
    )

    assert HttpDisplayFallbackGateway().get("/api/v1/config", "token") == expected
