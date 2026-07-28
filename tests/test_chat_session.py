import pytest
from starlette.websockets import WebSocketDisconnect

import ai_anime.api.chat_session as chat_session
from ai_anime.modules.ai_assistant.public import ChatScope


class RecordingWebSocket:
    def __init__(self, incoming=()):
        self.incoming = list(incoming)
        self.accepted = False
        self.events = []
        self.close_codes = []

    async def accept(self):
        self.accepted = True

    async def send_json(self, payload):
        self.events.append(payload)

    async def close(self, *, code):
        self.close_codes.append(code)

    async def receive_json(self):
        if not self.incoming:
            raise WebSocketDisconnect()
        value = self.incoming.pop(0)
        if isinstance(value, Exception):
            raise value
        return value


class RecordingPrewarmer:
    def __init__(self):
        self.calls = []

    async def prewarm(self, username, *, project):
        self.calls.append((username, project))


@pytest.mark.anyio
async def test_run_chat_session_rejects_unauthorized_connection(monkeypatch):
    websocket = RecordingWebSocket()

    async def reject(_websocket):
        raise RuntimeError("invalid session")

    monkeypatch.setattr(chat_session, "get_websocket_user", reject)

    await chat_session.run_chat_session(websocket)

    assert websocket.accepted is True
    assert websocket.events == [{"type": "error", "message": "unauthorized"}]
    assert websocket.close_codes == [1008]


@pytest.mark.anyio
async def test_run_chat_session_dispatches_message_in_current_scope(monkeypatch):
    websocket = RecordingWebSocket(
        [{"type": "chat.message", "text": "hello", "turn_id": "turn-1"}]
    )
    scope_calls = []
    dispatch_calls = []
    prewarmer = RecordingPrewarmer()

    async def authenticate(_websocket):
        return {"username": "alice"}

    async def send_scope(_websocket, user, username, scope):
        scope_calls.append((user, username, scope))
        return scope

    async def dispatch(_websocket, **kwargs):
        dispatch_calls.append(kwargs)

    monkeypatch.setattr(chat_session, "get_websocket_user", authenticate)
    monkeypatch.setattr(chat_session.chat_scope, "send_scope_changed", send_scope)
    monkeypatch.setattr(chat_session.chat_turns, "dispatch_chat_turn", dispatch)
    monkeypatch.setattr(chat_session, "agent_backend_prewarmer", prewarmer)

    await chat_session.run_chat_session(websocket)

    current_scope = ChatScope(kind="home")
    assert scope_calls == [({"username": "alice"}, "alice", current_scope)]
    assert len(dispatch_calls) == 1
    assert dispatch_calls[0]["user"] == {"username": "alice"}
    assert dispatch_calls[0]["username"] == "alice"
    assert dispatch_calls[0]["current_scope"] == current_scope
    assert dispatch_calls[0]["message"].text == "hello"
    assert prewarmer.calls == []


@pytest.mark.anyio
async def test_run_chat_session_syncs_and_prewarms_requested_scope(monkeypatch):
    websocket = RecordingWebSocket(
        [
            {
                "type": "scope.set",
                "scope": {"kind": "project", "id": "project-a"},
            }
        ]
    )
    scope_calls = []
    lifecycle_calls = []
    prewarmer = RecordingPrewarmer()

    async def authenticate(_websocket):
        return {"username": "alice"}

    async def send_scope(_websocket, _user, _username, scope):
        scope_calls.append(scope)
        return scope

    class RecordingLifecycle:
        async def sync_scope(self, username, scope):
            lifecycle_calls.append((username, scope))

    monkeypatch.setattr(chat_session, "get_websocket_user", authenticate)
    monkeypatch.setattr(chat_session.chat_scope, "send_scope_changed", send_scope)
    monkeypatch.setattr(chat_session, "chat_worker_lifecycle", RecordingLifecycle())
    monkeypatch.setattr(chat_session, "agent_backend_prewarmer", prewarmer)

    await chat_session.run_chat_session(websocket)

    home_scope = ChatScope(kind="home")
    project_scope = ChatScope(kind="project", id="project-a")
    assert scope_calls == [home_scope, project_scope]
    assert lifecycle_calls == [("alice", project_scope)]
    assert prewarmer.calls == [("alice", "project-a")]


@pytest.mark.anyio
async def test_run_chat_session_reports_unsupported_event_before_runtime_disconnect(
    monkeypatch,
):
    websocket = RecordingWebSocket(
        [
            {"type": "unknown"},
            RuntimeError("WebSocket is not connected. Need to call accept first."),
        ]
    )

    async def authenticate(_websocket):
        return {"username": "alice"}

    async def send_scope(_websocket, _user, _username, scope):
        return scope

    monkeypatch.setattr(chat_session, "get_websocket_user", authenticate)
    monkeypatch.setattr(chat_session.chat_scope, "send_scope_changed", send_scope)
    monkeypatch.setattr(
        chat_session,
        "agent_backend_prewarmer",
        RecordingPrewarmer(),
    )

    await chat_session.run_chat_session(websocket)

    assert websocket.events == [
        {"type": "error", "message": "unsupported event: unknown"}
    ]
