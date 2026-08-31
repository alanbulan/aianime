import pytest

from ai_anime.api.routes.ai_assistant import access as chat_access
from ai_anime.modules.ai_assistant.public import ChatScope


@pytest.mark.anyio
@pytest.mark.parametrize(
    "scope",
    [ChatScope(kind="home"), ChatScope(kind="project")],
)
async def test_project_context_skips_scopes_without_project_id(monkeypatch, scope):
    async def unexpected_resolve(**_kwargs):
        raise AssertionError("project resolution is not expected")

    monkeypatch.setattr(chat_access, "resolve_project_context", unexpected_resolve)

    assert await chat_access.project_context_for_scope({}, scope) is None


@pytest.mark.anyio
async def test_project_context_requires_viewer_access(monkeypatch):
    from types import SimpleNamespace

    seen = {}
    context = SimpleNamespace(requester_user_id="requester-1")

    async def resolve(**kwargs):
        seen.update(kwargs)
        return context

    monkeypatch.setattr(chat_access, "resolve_project_context", resolve)

    result = await chat_access.project_context_for_scope(
        {"username": "alice"},
        ChatScope(kind="project", id="project-a"),
    )

    assert result is context
    assert seen == {
        "user": {"username": "alice"},
        "project_id": "project-a",
        "required_role": "viewer",
    }


@pytest.mark.anyio
async def test_chat_access_returns_resolved_project_context(monkeypatch):
    context = object()

    async def project_context(user, scope):
        assert user == {"username": "alice"}
        assert scope == ChatScope(kind="project", id="project-a")
        return context

    monkeypatch.setattr(chat_access, "project_context_for_scope", project_context)

    result = await chat_access.require_ai_assistant_access(
        user={"username": "alice"},
        scope=ChatScope(kind="project", id="project-a"),
    )

    assert result is context
