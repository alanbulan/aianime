"""Ports required by Identity & Access application services."""

from __future__ import annotations

from typing import Any, Protocol

from ai_anime.modules.identity_access.domain import AgentSessionToken


class AuthPort(Protocol):
    async def verify_session(self, raw_cookie: str | None) -> dict[str, Any]: ...

    async def revoke_session(self, raw_cookie: str) -> None: ...


class AuthSessionPort(Protocol):
    async def verify_agent_session(self, token: str) -> dict[str, Any]: ...

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
    ) -> AgentSessionToken: ...

    async def update_agent_session_scope(
        self,
        token_value: str,
        *,
        scope_kind: str,
        project_id: str | None,
    ) -> None: ...

    async def revoke_agent_session(self, token_value: str) -> None: ...
