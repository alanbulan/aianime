from types import SimpleNamespace

import pytest

from ai_anime.modules.ai_assistant.application import PageAgentSessions
from ai_anime.modules.ai_assistant.application import (
    page_agent_sessions as sessions_module,
)
from ai_anime.modules.ai_assistant.composition import get_page_agent_sessions


def test_page_agent_sessions_composition_returns_one_process_instance():
    assert get_page_agent_sessions() is get_page_agent_sessions()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("project", "scope_kind", "project_id"),
    [("project-a", "project", "project-a"), ("", "home", None)],
)
async def test_page_agent_session_preserves_identity_contract(
    monkeypatch,
    project,
    scope_kind,
    project_id,
):
    captured = {}

    async def fake_create_agent_session(**kwargs):
        captured.update(kwargs)
        return SimpleNamespace(value="session-token")

    monkeypatch.setattr(
        sessions_module,
        "create_agent_session",
        fake_create_agent_session,
    )

    token = await PageAgentSessions().create_token(
        "admin",
        project,
        agent_kind="hermes",
    )

    assert token == "session-token"
    assert captured == {
        "username": "admin",
        "scopes": [
            "projects:read",
            "projects:write",
            "tasks:submit",
            "tasks:poll",
            "media:read",
            "assets:read",
        ],
        "ttl_seconds": 24 * 3600,
        "agent_kind": "hermes",
        "worker_id": "page-agent:hermes:admin",
        "current_scope_kind": scope_kind,
        "current_project_id": project_id,
        "metadata": {"source": "chat_service"},
    }
