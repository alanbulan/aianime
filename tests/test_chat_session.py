import pytest
from starlette.websockets import WebSocketDisconnect

import ai_anime.api.routes.ai_assistant.session as chat_session
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

    async def prewarm(self, username, *, project, conversation_id="main"):
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
    monkeypatch.setattr(chat_session, "hermes_runtime_prewarmer", prewarmer)

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
async def test_run_chat_session_skips_reprewarm_for_same_scope_history_refresh(monkeypatch):
    websocket = RecordingWebSocket(
        [
            {
                "type": "scope.set",
                "scope": {"kind": "project", "id": "project-a"},
            },
            {
                "type": "scope.set",
                "scope": {"kind": "project", "id": "project-a"},
            },
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
        def is_busy(self, _username):
            return False

        async def sync_scope(self, username, scope):
            lifecycle_calls.append((username, scope))

    monkeypatch.setattr(chat_session, "get_websocket_user", authenticate)
    monkeypatch.setattr(chat_session.chat_scope, "send_scope_changed", send_scope)
    monkeypatch.setattr(chat_session, "chat_worker_lifecycle", RecordingLifecycle())
    monkeypatch.setattr(chat_session, "hermes_runtime_prewarmer", prewarmer)

    await chat_session.run_chat_session(websocket)

    home_scope = ChatScope(kind="home")
    project_scope = ChatScope(kind="project", id="project-a")
    assert scope_calls == [home_scope, project_scope, project_scope]
    assert lifecycle_calls == [("alice", project_scope)]
    assert prewarmer.calls == [("alice", "project-a")]


@pytest.mark.anyio
async def test_run_chat_session_does_not_rotate_busy_worker_on_scope_change(
    monkeypatch,
):
    websocket = RecordingWebSocket(
        [
            {
                "type": "scope.set",
                "scope": {
                    "kind": "project",
                    "id": "project-a",
                    "conversationId": "chat-2",
                },
            }
        ]
    )
    lifecycle_calls = []
    prewarmer = RecordingPrewarmer()

    async def authenticate(_websocket):
        return {"username": "alice"}

    async def send_scope(_websocket, _user, _username, scope):
        return scope

    class BusyLifecycle:
        def is_busy(self, username):
            assert username == "alice"
            return True

        async def sync_scope(self, username, scope):
            lifecycle_calls.append((username, scope))

    monkeypatch.setattr(chat_session, "get_websocket_user", authenticate)
    monkeypatch.setattr(chat_session.chat_scope, "send_scope_changed", send_scope)
    monkeypatch.setattr(chat_session, "chat_worker_lifecycle", BusyLifecycle())
    monkeypatch.setattr(chat_session, "hermes_runtime_prewarmer", prewarmer)

    await chat_session.run_chat_session(websocket)

    assert lifecycle_calls == []
    assert prewarmer.calls == []


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
        "hermes_runtime_prewarmer",
        RecordingPrewarmer(),
    )

    await chat_session.run_chat_session(websocket)

    assert websocket.events == [
        {"type": "error", "message": "unsupported event: unknown"}
    ]


@pytest.mark.anyio
async def test_run_chat_session_deletes_requested_conversation(monkeypatch):
    websocket = RecordingWebSocket(
        [
            {
                "type": "conversation.delete",
                "scope": {
                    "kind": "project",
                    "id": "project-a",
                    "conversationId": "chat_2",
                },
                "conversationId": "chat_2",
            }
        ]
    )
    deleted = []
    forgotten = []

    async def authenticate(_websocket):
        return {"username": "alice"}

    async def send_scope(_websocket, _user, _username, scope):
        return scope

    async def project_context(_user, _scope):
        return None

    class RecordingMessages:
        def delete_conversation(self, username, scope, **_kwargs):
            deleted.append((username, scope))
            return True

        def list_conversations(self, _username, _scope, **_kwargs):
            return [{"id": "main", "title": "新会话"}]

    class RecordingLifecycle:
        def is_busy(self, _username):
            return False

        async def forget_conversation(self, username, scope):
            forgotten.append((username, scope))

    monkeypatch.setattr(chat_session, "get_websocket_user", authenticate)
    monkeypatch.setattr(chat_session.chat_scope, "send_scope_changed", send_scope)
    monkeypatch.setattr(
        chat_session.chat_access,
        "project_context_for_scope",
        project_context,
    )
    monkeypatch.setattr(chat_session, "scoped_chat_messages", RecordingMessages())
    monkeypatch.setattr(chat_session, "chat_worker_lifecycle", RecordingLifecycle())
    monkeypatch.setattr(
        chat_session,
        "hermes_runtime_prewarmer",
        RecordingPrewarmer(),
    )

    await chat_session.run_chat_session(websocket)

    target = ChatScope(
        kind="project",
        id="project-a",
        conversation_id="chat_2",
    )
    assert deleted == [("alice", target)]
    assert forgotten == [("alice", target)]
    assert websocket.events == [
        {
            "type": "conversation.deleted",
            "conversationId": "chat_2",
            "conversations": [{"id": "main", "title": "新会话"}],
        }
    ]
