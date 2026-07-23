"""Stable application API exposed by Identity & Access."""

from __future__ import annotations

from typing import Any, Iterable

from ai_anime.modules.identity_access.application.errors import (
    IdentityBackendNotInitialized,
)
from ai_anime.modules.identity_access.application.ports import AuthPort, AuthSessionPort
from ai_anime.modules.identity_access.domain import (
    AgentAuthenticatedUser,
    AgentSessionToken,
    AuthenticatedUser,
    AuthError,
    AuthFailureReason,
    create_desktop_session,
)


async def verify_browser_session(raw_cookie: str | None) -> dict[str, Any]:
    from ai_anime.modules.identity_access.composition import browser_sessions

    return await browser_sessions().verify(raw_cookie)


async def revoke_browser_session(raw_cookie: str) -> None:
    from ai_anime.modules.identity_access.composition import browser_sessions

    await browser_sessions().revoke(raw_cookie)


async def verify_agent_session(token: str) -> dict[str, Any]:
    from ai_anime.modules.identity_access.composition import agent_sessions

    return await agent_sessions().verify(token)


async def create_agent_session(
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
    from ai_anime.modules.identity_access.composition import agent_sessions

    return await agent_sessions().create(
        username=username,
        scopes=scopes,
        ttl_seconds=ttl_seconds,
        agent_kind=agent_kind,
        worker_id=worker_id,
        parent_session_id=parent_session_id,
        current_scope_kind=current_scope_kind,
        current_project_id=current_project_id,
        metadata=metadata,
    )


async def update_agent_session_scope(
    token_value: str,
    *,
    scope_kind: str,
    project_id: str | None,
) -> None:
    from ai_anime.modules.identity_access.composition import agent_sessions

    await agent_sessions().update_scope(
        token_value,
        scope_kind=scope_kind,
        project_id=project_id,
    )


async def revoke_agent_session(token_value: str) -> None:
    from ai_anime.modules.identity_access.composition import agent_sessions

    await agent_sessions().revoke(token_value)


def build_local_identity_adapters() -> tuple[AuthPort, AuthSessionPort]:
    from ai_anime.modules.identity_access.infrastructure.local_auth import (
        FileAuthPort,
        LocalAuthSession,
    )

    return FileAuthPort(), LocalAuthSession()


__all__ = [
    "AgentAuthenticatedUser",
    "AgentSessionToken",
    "AuthError",
    "AuthFailureReason",
    "AuthPort",
    "AuthSessionPort",
    "AuthenticatedUser",
    "IdentityBackendNotInitialized",
    "build_local_identity_adapters",
    "create_agent_session",
    "create_desktop_session",
    "revoke_agent_session",
    "revoke_browser_session",
    "update_agent_session_scope",
    "verify_agent_session",
    "verify_browser_session",
]
