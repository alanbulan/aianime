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
    from ai_anime.api.routes.ai_assistant import http as chat_http_routes
    from ai_anime.shared.ports import registry

    class NoOpChatWorkerLifecycle:
        async def cancel(self, _username) -> bool:
            return False

    monkeypatch.setenv("AI_ANIME_EDITION", "ce")
    monkeypatch.setenv("AI_ANIME_CONTROL_PLANE_DSN", "")
    monkeypatch.setenv("REDIS_URL", "")
    monkeypatch.setattr(registry, "_PORTS", {})
    monkeypatch.setattr(registry, "_BOOTSTRAPPED", False)
    monkeypatch.setattr(
        chat_http_routes,
        "chat_worker_lifecycle",
        NoOpChatWorkerLifecycle(),
    )

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
    from ai_anime.api.routes.ai_assistant import session as chat_session
    from ai_anime.modules.model_usage.public import configure_model_access
    from ai_anime.shared.ports import registry

    class NoOpPrewarmer:
        async def prewarm(self, *_args, **_kwargs) -> None:
            return None

    monkeypatch.setenv("AI_ANIME_EDITION", "ce")
    monkeypatch.setenv("AI_ANIME_CONTROL_PLANE_DSN", "")
    monkeypatch.setenv("REDIS_URL", "")
    monkeypatch.setattr(registry, "_PORTS", {})
    monkeypatch.setattr(registry, "_BOOTSTRAPPED", False)
    monkeypatch.setattr(chat_session, "hermes_runtime_prewarmer", NoOpPrewarmer())
    configure_model_access(
        allows_custom_models=False,
        mode="mixed",
        model_assignments=[{"modelId": "cloud-text-default", "role": "TEXT"}],
    )

    app = create_app()
    with TestClient(app) as client:
        with client.websocket_connect("/api/v1/chat/ws") as websocket:
            first_frame = websocket.receive_json()

    assert first_frame["type"] == "scope.changed"
    assert first_frame["scope"] == {
        "kind": "home",
        "id": None,
        "conversationId": "main",
    }


def test_chat_ws_auth_failure_reports_unauthorized(monkeypatch) -> None:
    from ai_anime.api.app import create_app
    from ai_anime.api.routes.ai_assistant import session as chat_session
    from ai_anime.api.routes.identity_access import dependencies as api_auth
    from ai_anime.shared.ports import registry

    async def _reject_browser_session(_raw_cookie: str | None) -> dict:
        raise HTTPException(status_code=401, detail="Invalid session")

    class NoOpPrewarmer:
        async def prewarm(self, *_args, **_kwargs) -> None:
            return None

    monkeypatch.setenv("AI_ANIME_EDITION", "ce")
    monkeypatch.setenv("AI_ANIME_CONTROL_PLANE_DSN", "")
    monkeypatch.setenv("REDIS_URL", "")
    monkeypatch.setattr(registry, "_PORTS", {})
    monkeypatch.setattr(registry, "_BOOTSTRAPPED", False)
    monkeypatch.setattr(api_auth, "_verify_browser_session", _reject_browser_session)
    monkeypatch.setattr(chat_session, "hermes_runtime_prewarmer", NoOpPrewarmer())

    app = create_app()
    with TestClient(app) as client:
        client.cookies.set("ai_anime_session", "bad-cookie")
        with client.websocket_connect("/api/v1/chat/ws") as websocket:
            first_frame = websocket.receive_json()

    assert first_frame == {"type": "error", "message": "unauthorized"}


@pytest.mark.asyncio
async def test_ce_chat_page_agent_session_uses_local_auth_session(monkeypatch) -> None:
    from ai_anime.modules.ai_assistant.public import create_page_agent_session_token
    from ai_anime.modules.identity_access.public import (
        revoke_agent_session,
        update_agent_session_scope,
        verify_agent_session,
    )
    from ai_anime.shared.ports import registry
    from ai_anime.shared.ports.local import register_local_ports

    monkeypatch.setattr(registry, "_PORTS", {})
    monkeypatch.setattr(registry, "_BOOTSTRAPPED", False)
    register_local_ports()

    token_value = await create_page_agent_session_token(
        "local",
        "project-a",
        agent_kind="hermes",
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
