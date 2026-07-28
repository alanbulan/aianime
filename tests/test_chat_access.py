from types import SimpleNamespace

import pytest

from ai_anime.api import chat_access
from ai_anime.modules.ai_assistant.public import ChatScope


class FakeUsageMeter:
    def __init__(self):
        self.requests = []

    async def require_feature_credit_balance(self, **kwargs):
        self.requests.append(kwargs)
        return {"allowed": True}


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
async def test_chat_access_uses_home_user_and_feature_contract(monkeypatch):
    usage_meter = FakeUsageMeter()
    monkeypatch.setattr(chat_access, "get_usage_meter", lambda: usage_meter)

    await chat_access.require_ai_assistant_access(
        user={"id": "user-1", "username": "alice"},
        scope=ChatScope(kind="home"),
    )

    assert usage_meter.requests == [
        {
            "user_id": "user-1",
            "feature_key": "ai_assistant_chat",
            "project_id": "",
            "resource_kind": "chat",
            "metadata": {"scope": {"kind": "home", "id": None}},
        }
    ]


@pytest.mark.anyio
async def test_chat_access_uses_resolved_project_requester(monkeypatch):
    usage_meter = FakeUsageMeter()

    async def project_context(_user, _scope):
        return SimpleNamespace(requester_user_id="requester-1")

    monkeypatch.setattr(chat_access, "project_context_for_scope", project_context)
    monkeypatch.setattr(chat_access, "get_usage_meter", lambda: usage_meter)

    await chat_access.require_ai_assistant_access(
        user={"id": "session-user", "username": "alice"},
        scope=ChatScope(kind="project", id="project-a"),
    )

    assert usage_meter.requests[0]["user_id"] == "requester-1"
    assert usage_meter.requests[0]["project_id"] == "project-a"
    assert usage_meter.requests[0]["metadata"] == {
        "scope": {"kind": "project", "id": "project-a"}
    }


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("user", "expected_user_id"),
    [
        ({"user_id": "fallback-1", "username": "alice"}, "fallback-1"),
        ({"username": "alice"}, "alice"),
    ],
)
async def test_chat_access_keeps_user_id_fallbacks(
    monkeypatch,
    user,
    expected_user_id,
):
    usage_meter = FakeUsageMeter()
    monkeypatch.setattr(chat_access, "get_usage_meter", lambda: usage_meter)

    await chat_access.require_ai_assistant_access(
        user=user,
        scope=ChatScope(kind="home"),
    )

    assert usage_meter.requests[0]["user_id"] == expected_user_id
