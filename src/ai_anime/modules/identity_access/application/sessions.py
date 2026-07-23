"""Browser and agent session use cases."""

from __future__ import annotations

from typing import Any, Iterable

from ai_anime.modules.identity_access.application.ports import AuthPort, AuthSessionPort
from ai_anime.modules.identity_access.domain import AgentSessionToken


class BrowserSessions:
    def __init__(self, auth: AuthPort) -> None:
        self._auth = auth

    async def verify(self, raw_cookie: str | None) -> dict[str, Any]:
        return await self._auth.verify_session(raw_cookie)

    async def revoke(self, raw_cookie: str) -> None:
        await self._auth.revoke_session(raw_cookie)


class AgentSessions:
    def __init__(self, sessions: AuthSessionPort) -> None:
        self._sessions = sessions

    async def verify(self, token: str) -> dict[str, Any]:
        return await self._sessions.verify_agent_session(token)

    async def create(
        self,
        *,
        username: str,
        scopes: Iterable[str],
        ttl_seconds: int | None = None,
        agent_kind: str = "agent",
        worker_id: str | None = None,
        parent_session_id: str | None = None,
        current_scope_kind: str = "home",
        current_project_id: str | None = None,
        metadata: dict | None = None,
    ) -> AgentSessionToken:
        return await self._sessions.create_agent_session(
            username=username,
            scopes=tuple(scopes),
            ttl_seconds=ttl_seconds,
            agent_kind=agent_kind,
            worker_id=worker_id,
            parent_session_id=parent_session_id,
            current_scope_kind=current_scope_kind,
            current_project_id=current_project_id,
            metadata=metadata,
        )

    async def update_scope(
        self,
        token_value: str,
        *,
        scope_kind: str,
        project_id: str | None,
    ) -> None:
        await self._sessions.update_agent_session_scope(
            token_value,
            scope_kind=scope_kind,
            project_id=project_id,
        )

    async def revoke(self, token_value: str) -> None:
        await self._sessions.revoke_agent_session(token_value)
