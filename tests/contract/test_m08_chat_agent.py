import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from ai_anime.modules.identity_access.public import AuthError

pytestmark = pytest.mark.m08


def test_ce_agent_key_routes_are_not_mounted(monkeypatch) -> None:
    from ai_anime.api.app import create_app

    monkeypatch.setenv("AI_ANIME_EDITION", "ce")
    monkeypatch.setenv("AI_ANIME_CONTROL_PLANE_DSN", "")

    paths = set(create_app().openapi()["paths"])

    assert "/api/v1/chat/cancel" in paths
    assert paths.isdisjoint(
        {
            "/api/v1/agent/keys",
            "/api/v1/agent/keys/{key_id}/revoke",
            "/api/v1/agent/sessions",
        }
    )


def test_ce_chat_http_routes_are_mounted_and_use_local_auth(monkeypatch) -> None:
    from ai_anime.api.app import create_app
    from ai_anime.api.routes import chat as chat_routes
    from ai_anime.ports import registry

    class NoOpChatRunLocks:
        def force_release(self, *_args) -> None:
            return None

    monkeypatch.setenv("AI_ANIME_EDITION", "ce")
    monkeypatch.setenv("AI_ANIME_CONTROL_PLANE_DSN", "")
    monkeypatch.setenv("REDIS_URL", "")
    monkeypatch.setattr(registry, "_PORTS", {})
    monkeypatch.setattr(registry, "_BOOTSTRAPPED", False)
    monkeypatch.setattr(chat_routes, "chat_run_locks", NoOpChatRunLocks())

    app = create_app()
    with TestClient(app) as client:
        cancel = client.post("/api/v1/chat/cancel")
        ui_event = client.post(
            "/api/v1/chat/ui-events",
            json={
                "scope": {"kind": "home"},
                "turn_id": "turn-1",
                "event": {"type": "noop"},
            },
        )

    assert cancel.status_code == 200
    assert cancel.json()["ok"] is True
    assert ui_event.status_code == 200
    assert ui_event.json()["ok"] is True


def test_ce_chat_ws_accepts_missing_cookie_via_local_auth(monkeypatch) -> None:
    from ai_anime.api.app import create_app
    from ai_anime.chat import service as chat_service
    from ai_anime.ports import registry

    async def _no_prewarm(*_args, **_kwargs) -> None:
        return None

    monkeypatch.setenv("AI_ANIME_EDITION", "ce")
    monkeypatch.setenv("AI_ANIME_CONTROL_PLANE_DSN", "")
    monkeypatch.setenv("REDIS_URL", "")
    monkeypatch.setattr(registry, "_PORTS", {})
    monkeypatch.setattr(registry, "_BOOTSTRAPPED", False)
    monkeypatch.setattr(chat_service, "prewarm_chat_backend", _no_prewarm)

    app = create_app()
    with TestClient(app) as client:
        with client.websocket_connect("/api/v1/chat/ws") as websocket:
            first_frame = websocket.receive_json()

    assert first_frame["type"] == "scope.changed"
    assert first_frame["scope"] == {"kind": "home", "id": None}


def test_chat_ws_auth_failure_reports_unauthorized(monkeypatch) -> None:
    from ai_anime.api.app import create_app
    from ai_anime.api.routes import chat as chat_routes
    from ai_anime.chat import service as chat_service
    from ai_anime.ports import registry

    async def _reject_browser_session(_raw_cookie: str | None) -> dict:
        raise HTTPException(status_code=401, detail="Invalid session")

    async def _no_prewarm(*_args, **_kwargs) -> None:
        return None

    monkeypatch.setenv("AI_ANIME_EDITION", "ce")
    monkeypatch.setenv("AI_ANIME_CONTROL_PLANE_DSN", "")
    monkeypatch.setenv("REDIS_URL", "")
    monkeypatch.setattr(registry, "_PORTS", {})
    monkeypatch.setattr(registry, "_BOOTSTRAPPED", False)
    monkeypatch.setattr(chat_routes, "_verify_browser_session", _reject_browser_session)
    monkeypatch.setattr(chat_service, "prewarm_chat_backend", _no_prewarm)

    app = create_app()
    with TestClient(app) as client:
        client.cookies.set("ai_anime_session", "bad-cookie")
        with client.websocket_connect("/api/v1/chat/ws") as websocket:
            first_frame = websocket.receive_json()

    assert first_frame == {"type": "error", "message": "unauthorized"}


@pytest.mark.asyncio
async def test_ce_chat_page_agent_session_uses_local_auth_session(monkeypatch) -> None:
    from ai_anime.chat import service as chat_service
    from ai_anime.modules.identity_access.public import (
        revoke_agent_session,
        update_agent_session_scope,
        verify_agent_session,
    )
    from ai_anime.ports import registry
    from ai_anime.ports.local import register_local_ports

    monkeypatch.setattr(registry, "_PORTS", {})
    monkeypatch.setattr(registry, "_BOOTSTRAPPED", False)
    register_local_ports()

    token_value = await chat_service._create_page_agent_session_token(
        "local",
        "project-a",
        agent_kind="codex",
    )

    user = await verify_agent_session(token_value)
    assert user["username"] == "local"
    assert user["current_scope_kind"] == "project"
    assert user["current_project_id"] == "project-a"

    await update_agent_session_scope(
        token_value,
        scope_kind="home",
        project_id=None,
    )
    updated = await verify_agent_session(token_value)
    assert updated["current_scope_kind"] == "home"
    assert updated["current_project_id"] is None

    await revoke_agent_session(token_value)
    with pytest.raises(AuthError):
        await verify_agent_session(token_value)
