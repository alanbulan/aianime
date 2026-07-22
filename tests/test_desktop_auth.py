from __future__ import annotations

import json

import pytest
from fastapi import HTTPException

from ai_anime.api.routes.auth import (
    DesktopAuthorizationRequest,
    DesktopLoginRequest,
    authorize,
    login,
)
from ai_anime.ports.local.auth import FileAuthPort, desktop_session_username


def _cookie_value(response) -> str:
    cookie = response.headers["set-cookie"].split(";", 1)[0]
    return cookie.split("=", 1)[1]


@pytest.mark.asyncio
async def test_desktop_account_login_sets_restorable_session(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AI_ANIME_DESKTOP_MODE", "1")

    response = await login(DesktopLoginRequest(username="alice", password="secret"))
    payload = json.loads(response.body)
    cookie = _cookie_value(response)

    assert payload["data"]["username"] == "alice"
    assert "HttpOnly" in response.headers["set-cookie"]
    assert desktop_session_username(cookie) == "alice"
    assert (await FileAuthPort().verify_session(cookie))["username"] == "alice"


@pytest.mark.asyncio
async def test_desktop_authorization_uses_local_identity_contract(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AI_ANIME_DESKTOP_MODE", "1")
    monkeypatch.setenv("AI_ANIME_LOCAL_USERNAME", "licensed-user")

    response = await authorize(DesktopAuthorizationRequest(code="AUTH-001"))
    payload = json.loads(response.body)

    assert payload["data"]["username"] == "licensed-user"


@pytest.mark.asyncio
async def test_desktop_login_endpoint_is_not_exposed_outside_desktop_mode(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("AI_ANIME_DESKTOP_MODE", raising=False)

    with pytest.raises(HTTPException) as exc:
        await login(DesktopLoginRequest(username="alice", password="secret"))

    assert exc.value.status_code == 404
