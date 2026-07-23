from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest


def test_desktop_app_requires_session_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("AI_ANIME_DESKTOP_MODE", raising=False)
    from ai_anime.api.app import create_app

    monkeypatch.setenv("AI_ANIME_DESKTOP_MODE", "1")
    monkeypatch.delenv("AI_ANIME_DESKTOP_TOKEN", raising=False)

    with pytest.raises(RuntimeError, match="AI_ANIME_DESKTOP_TOKEN"):
        create_app()


def test_desktop_middleware_and_shutdown_route(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AI_ANIME_DESKTOP_MODE", "1")
    monkeypatch.setenv("AI_ANIME_DESKTOP_TOKEN", "desktop-test-token")

    from ai_anime.api.app import create_app

    application = create_app()
    shutdown_calls: list[bool] = []
    application.state.desktop_shutdown = lambda: shutdown_calls.append(True)
    client = TestClient(application)

    rejected = client.get("/healthz")
    assert rejected.status_code == 401
    assert rejected.json() == {
        "ok": False,
        "error": "desktop session rejected",
    }

    headers = {"X-AI-Anime-Desktop-Token": "desktop-test-token"}
    assert client.get("/healthz", headers=headers).json() == {"status": "ok"}
    assert client.post("/__desktop/shutdown", headers=headers).json() == {"ok": True}
    assert shutdown_calls == [True]


@pytest.mark.asyncio
async def test_app_lifespan_orders_startup_and_shutdown(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from ai_anime.api import lifespan as lifespan_module

    events: list[str] = []

    async def startup() -> None:
        events.append("startup")

    async def shutdown() -> None:
        events.append("shutdown")

    monkeypatch.setattr(lifespan_module, "startup_application", startup)
    monkeypatch.setattr(lifespan_module, "shutdown_application", shutdown)

    async with lifespan_module.app_lifespan(FastAPI()):
        events.append("serving")

    assert events == ["startup", "serving", "shutdown"]
