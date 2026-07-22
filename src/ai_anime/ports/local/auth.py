"""Local CE authentication port implementations."""

from __future__ import annotations

import os
import time
from base64 import urlsafe_b64decode, urlsafe_b64encode
from dataclasses import replace

from ulid import ULID

from ai_anime.ports.auth_contract import (
    AgentAuthenticatedUser,
    AgentSessionToken,
    AuthenticatedUser,
    AuthError,
    AuthFailureReason,
)


class FileAuthPort:
    async def verify_session(self, raw_cookie: str | None) -> dict:
        if os.environ.get("AI_ANIME_DESKTOP_MODE") == "1":
            username = desktop_session_username(raw_cookie)
            if username is None:
                reason = AuthFailureReason.MISSING if not raw_cookie else AuthFailureReason.INVALID
                raise AuthError(reason, "desktop session is missing or invalid")
        else:
            username = os.environ.get("AI_ANIME_LOCAL_USERNAME", "").strip() or "local"
        return AuthenticatedUser(id="local", username=username, role="owner").to_legacy_dict()

    async def revoke_session(self, raw_cookie: str) -> None:
        return None


def create_desktop_session(username: str) -> str:
    encoded = urlsafe_b64encode(username.encode("utf-8")).decode("ascii").rstrip("=")
    return f"desktop.{encoded}"


def desktop_session_username(raw_cookie: str | None) -> str | None:
    if not raw_cookie or not raw_cookie.startswith("desktop."):
        return None
    encoded = raw_cookie.removeprefix("desktop.")
    try:
        value = urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4)).decode("utf-8")
    except (UnicodeDecodeError, ValueError):
        return None
    value = value.strip()
    return value if 0 < len(value) <= 128 else None


class LocalAuthSession:
    def __init__(self) -> None:
        self._sessions: dict[str, AgentAuthenticatedUser] = {}

    async def create_agent_session(
        self,
        *,
        username: str,
        scopes,
        ttl_seconds: int | None = None,
        agent_kind: str = "agent",
        worker_id: str | None = None,
        parent_session_id: str | None = None,
        current_scope_kind: str = "home",
        current_project_id: str | None = None,
        metadata: dict | None = None,
    ) -> AgentSessionToken:
        session_id = str(ULID())
        token_value = f"local-{ULID()}"
        exp = int(time.time()) + int(ttl_seconds or 2 * 3600)
        normalized_scopes = tuple(scopes or ())
        self._sessions[token_value] = AgentAuthenticatedUser(
            id="local",
            username=username,
            role="owner",
            agent_session_id=session_id,
            agent_kind=agent_kind,
            worker_id=worker_id,
            scopes=normalized_scopes,
            current_scope_kind=current_scope_kind,
            current_project_id=current_project_id,
            parent_session_id=parent_session_id,
        )
        return AgentSessionToken(
            value=token_value,
            session_id=session_id,
            user=username,
            scopes=normalized_scopes,
            exp=exp,
            worker_id=worker_id or "",
            agent_kind=agent_kind,
        )

    async def verify_agent_session(self, token: str) -> dict:
        session = self._sessions.get(token)
        if session is None:
            raise AuthError(AuthFailureReason.INVALID, "agent session not found")
        # CE local agent tokens intentionally do not expire. The single-user
        # trust boundary is local machine ownership; revoke invalidates workers.
        return session.to_legacy_dict()

    async def update_agent_session_scope(
        self,
        token_value: str,
        *,
        scope_kind: str,
        project_id: str | None,
    ) -> None:
        session = self._sessions.get(token_value)
        if session is None:
            raise AuthError(AuthFailureReason.INVALID, "agent session not found")
        self._sessions[token_value] = replace(
            session,
            current_scope_kind=scope_kind,
            current_project_id=project_id,
        )

    async def revoke_agent_session(self, token_value: str) -> None:
        self._sessions.pop(token_value, None)
