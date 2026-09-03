from __future__ import annotations

import httpx
import pytest

from ai_anime.shared.infrastructure import model_invocation_control


@pytest.mark.asyncio
async def test_explicit_task_cancel_uses_authenticated_loopback_control(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(
        "AI_ANIME_CLOUD_PROXY_BASE_URL",
        "http://127.0.0.1:45678/v1",
    )
    monkeypatch.setenv("AI_ANIME_CLOUD_PROXY_TOKEN", "proxy-secret")
    calls: list[dict[str, object]] = []

    class FakeAsyncClient:
        def __init__(self, **kwargs) -> None:
            calls.append({"client": kwargs})

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args) -> None:
            return None

        async def post(self, url, **kwargs):
            calls.append({"url": url, **kwargs})
            return httpx.Response(200, request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx, "AsyncClient", FakeAsyncClient)

    result = await model_invocation_control.request_model_invocation_cancellation(
        "BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB",
        reason="user explicitly cancelled",
    )

    assert result is True
    assert calls == [
        {"client": {"timeout": 15.0, "trust_env": False}},
        {
            "url": (
                "http://127.0.0.1:45678/v1/_aigo/model-invocations/tasks/"
                "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/cancel"
            ),
            "headers": {"Authorization": "Bearer proxy-secret"},
            "json": {"reason": "user explicitly cancelled"},
        },
    ]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "base_url",
    [
        "https://gateway.example/v1",
        "http://127.0.0.1.attacker.example/v1",
        "http://user:password@127.0.0.1:45678/v1",
        "http://127.0.0.1:45678/not-v1",
        "http://127.0.0.1:45678/v1?redirect=http://attacker.example",
        "http://127.0.0.1:45678/v1#fragment",
    ],
)
async def test_explicit_task_cancel_refuses_non_loopback_proxy_urls(
    monkeypatch: pytest.MonkeyPatch,
    base_url: str,
) -> None:
    monkeypatch.setenv("AI_ANIME_CLOUD_PROXY_BASE_URL", base_url)
    monkeypatch.setenv("AI_ANIME_CLOUD_PROXY_TOKEN", "proxy-secret")

    class UnexpectedClient:
        def __init__(self, **_kwargs) -> None:
            raise AssertionError("non-loopback cancellation URL must not be requested")

    monkeypatch.setattr(httpx, "AsyncClient", UnexpectedClient)

    assert (
        await model_invocation_control.request_model_invocation_cancellation(
            "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            reason="user explicitly cancelled",
        )
        is False
    )


@pytest.mark.asyncio
async def test_explicit_task_cancel_refuses_invalid_task_ids(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(
        "AI_ANIME_CLOUD_PROXY_BASE_URL",
        "http://127.0.0.1:45678/v1",
    )
    monkeypatch.setenv("AI_ANIME_CLOUD_PROXY_TOKEN", "proxy-secret")

    class UnexpectedClient:
        def __init__(self, **_kwargs) -> None:
            raise AssertionError("invalid task ID must not be requested")

    monkeypatch.setattr(httpx, "AsyncClient", UnexpectedClient)

    assert (
        await model_invocation_control.request_model_invocation_cancellation(
            "../../other-control",
            reason="user explicitly cancelled",
        )
        is False
    )


@pytest.mark.asyncio
async def test_explicit_task_cancel_is_a_noop_without_electron_proxy(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("AI_ANIME_CLOUD_PROXY_BASE_URL", raising=False)
    monkeypatch.delenv("AI_ANIME_CLOUD_PROXY_TOKEN", raising=False)

    assert (
        await model_invocation_control.request_model_invocation_cancellation(
            "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            reason="user explicitly cancelled",
        )
        is False
    )
