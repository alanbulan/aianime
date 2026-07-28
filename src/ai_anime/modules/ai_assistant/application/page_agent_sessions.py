"""Page-level agent session issuance."""

from ai_anime.modules.identity_access.public import create_agent_session

PAGE_AGENT_SCOPES = [
    "projects:read",
    "projects:write",
    "tasks:submit",
    "tasks:poll",
    "media:read",
    "assets:read",
]
PAGE_AGENT_SESSION_TTL_SECONDS = 24 * 3600


class PageAgentSessions:
    async def create_token(
        self,
        username: str,
        project: str,
        *,
        agent_kind: str,
    ) -> str:
        token = await create_agent_session(
            username=username,
            scopes=PAGE_AGENT_SCOPES,
            ttl_seconds=PAGE_AGENT_SESSION_TTL_SECONDS,
            agent_kind=agent_kind,
            worker_id=f"page-agent:{agent_kind}:{username}",
            current_scope_kind="project" if project else "home",
            current_project_id=project or None,
            metadata={"source": "chat_service"},
        )
        return token.value
