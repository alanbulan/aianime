from __future__ import annotations

from types import SimpleNamespace

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
    from ai_anime import sqlite_pragmas

    events: list[str] = []

    class Lifecycle:
        async def on_startup(self, *, register_as_worker: bool = True) -> None:
            assert register_as_worker is True
            events.append("startup")

        async def on_shutdown(self) -> None:
            events.append("shutdown")

    application = FastAPI()
    application.state.container = SimpleNamespace(lifecycle=Lifecycle())
    monkeypatch.setattr(sqlite_pragmas, "litestream_enabled", lambda: False)

    async with lifespan_module.app_lifespan(application):
        events.append("serving")

    assert events == ["startup", "serving", "shutdown"]
