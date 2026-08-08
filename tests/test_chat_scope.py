from types import SimpleNamespace

import pytest
from starlette.websockets import WebSocketDisconnect

from ai_anime.api.routes.ai_assistant import scope as chat_scope
from ai_anime.modules.ai_assistant.public import ChatScope
from ai_anime.modules.project_workspace.public import ProjectNotFound


class RecordingWebSocket:
    def __init__(self):
        self.events = []

    async def send_json(self, payload):
        self.events.append(payload)


@pytest.mark.anyio
async def test_send_scope_changed_returns_none_when_client_disconnected(monkeypatch):
    class DisconnectedWebSocket:
        async def send_json(self, _payload):
            raise WebSocketDisconnect(code=1006)

    async def history(_username, _scope, *, project_ctx=None):
        return []

    monkeypatch.setattr(chat_scope, "_history", history)
    monkeypatch.setattr(
        chat_scope.chat_worker_lifecycle, "is_busy", lambda _user: False
    )

    result = await chat_scope.send_scope_changed(
        DisconnectedWebSocket(),
        {"username": "admin"},
        "admin",
        ChatScope(kind="home"),
    )

    assert result is None


@pytest.mark.anyio
async def test_missing_project_reports_error_and_falls_back_home(monkeypatch):
    websocket = RecordingWebSocket()

    async def missing_project(_user, _scope):
        raise ProjectNotFound("project-a")

    async def history(_username, scope, *, project_ctx=None):
        assert scope == ChatScope(kind="home")
        assert project_ctx is None
        return [{"role": "assistant", "content": "home"}]

    monkeypatch.setattr(
        chat_scope.chat_access,
        "project_context_for_scope",
        missing_project,
    )
    monkeypatch.setattr(chat_scope, "_history", history)
    monkeypatch.setattr(
        chat_scope.chat_worker_lifecycle, "is_busy", lambda _user: False
    )

    result = await chat_scope.send_scope_changed(
        websocket,
        {"username": "admin"},
        "admin",
        ChatScope(kind="project", id="project-a"),
    )

    assert result == ChatScope(kind="home")
    assert websocket.events == [
        {"type": "error", "message": "项目不存在或已删除，已切回首页聊天。"},
        {
            "type": "scope.changed",
            "scope": {"kind": "home", "id": None},
            "history": [{"role": "assistant", "content": "home"}],
            "busy": False,
        },
    ]


@pytest.mark.anyio
async def test_scope_changed_projects_authorized_history_and_busy_state(
    monkeypatch,
    tmp_path,
):
    websocket = RecordingWebSocket()
    context = SimpleNamespace(
        output_dir=tmp_path / "output",
        state_dir=tmp_path / "state",
    )
    seen = {}

    async def project_context(_user, _scope):
        return context

    def list_messages(username, scope, *, project_dir=None, project_state_dir=None):
        seen.update(
            {
                "username": username,
                "scope": scope,
                "project_dir": project_dir,
                "project_state_dir": project_state_dir,
            }
        )
        return [{"role": "assistant", "content": "project"}]

    monkeypatch.setattr(
        chat_scope.chat_access,
        "project_context_for_scope",
        project_context,
    )
    monkeypatch.setattr(chat_scope.scoped_chat_messages, "list", list_messages)
    monkeypatch.setattr(chat_scope.chat_worker_lifecycle, "is_busy", lambda _user: True)
    scope = ChatScope(kind="project", id="project-a")

    result = await chat_scope.send_scope_changed(
        websocket,
        {"username": "admin"},
        "admin",
        scope,
    )

    assert result == scope
    assert seen == {
        "username": "admin",
        "scope": scope,
        "project_dir": tmp_path / "output",
        "project_state_dir": tmp_path / "state",
    }
    assert websocket.events == [
        {
            "type": "scope.changed",
            "scope": {"kind": "project", "id": "project-a"},
            "history": [{"role": "assistant", "content": "project"}],
            "busy": True,
        }
    ]
