from pathlib import Path
from types import SimpleNamespace

import pytest

import ai_anime.api.chat_turns as chat_turns
from ai_anime.api.chat_schemas import (
    ChatAttachmentIn,
    ChatMessageIn,
    ChatScopePayload,
)
from ai_anime.modules.ai_assistant.public import ChatScope


class RecordingWebSocket:
    def __init__(self):
        self.events = []

    async def send_json(self, payload):
        self.events.append(payload)


@pytest.mark.anyio
async def test_dispatch_chat_turn_streams_authorized_project_message(monkeypatch):
    websocket = RecordingWebSocket()
    access_calls = []
    stream_calls = []
    transport_calls = []
    project_ctx = SimpleNamespace(
        output_dir=Path("output/project-a"),
        state_dir=Path("state/project-a"),
    )

    async def require_access(*, user, scope):
        access_calls.append(("require", user, scope))

    async def project_context(user, scope):
        access_calls.append(("context", user, scope))
        return project_ctx

    class StubProjectChatTurns:
        async def stream(
            self,
            username,
            scope,
            text,
            attachments,
            turn_id,
            on_event,
            *,
            project_dir,
            project_state_dir,
        ):
            stream_calls.append(
                {
                    "username": username,
                    "scope": scope,
                    "text": text,
                    "attachments": attachments,
                    "turn_id": turn_id,
                    "project_dir": project_dir,
                    "project_state_dir": project_state_dir,
                }
            )
            await on_event({"type": "chat.done", "turn_id": turn_id})

    async def stream_turn(websocket, *, scope, turn_id, event_stream):
        transport_calls.append((scope, turn_id))
        await event_stream(websocket.send_json)

    monkeypatch.setattr(
        chat_turns.chat_access,
        "require_ai_assistant_access",
        require_access,
    )
    monkeypatch.setattr(
        chat_turns.chat_access,
        "project_context_for_scope",
        project_context,
    )
    monkeypatch.setattr(chat_turns, "project_chat_turns", StubProjectChatTurns())
    monkeypatch.setattr(chat_turns, "stream_chat_turn", stream_turn)

    user = {"username": "alice"}
    scope = ChatScope(kind="project", id="project-a")
    await chat_turns.dispatch_chat_turn(
        websocket,
        user=user,
        username="alice",
        current_scope=ChatScope(kind="home"),
        message=ChatMessageIn(
            type="chat.message",
            scope=ChatScopePayload(kind="project", id="project-a"),
            text="  create a scene  ",
            turn_id=" turn-1 ",
            attachments=[
                ChatAttachmentIn(
                    id="image-1",
                    mimeType="image/png",
                    url="/images/one.png",
                )
            ],
        ),
    )

    assert access_calls == [
        ("require", user, scope),
        ("context", user, scope),
    ]
    assert transport_calls == [(scope, "turn-1")]
    assert stream_calls == [
        {
            "username": "alice",
            "scope": scope,
            "text": "create a scene",
            "attachments": [
                {
                    "id": "image-1",
                    "mimeType": "image/png",
                    "url": "/images/one.png",
                }
            ],
            "turn_id": "turn-1",
            "project_dir": project_ctx.output_dir,
            "project_state_dir": project_ctx.state_dir,
        }
    ]
    assert websocket.events == [{"type": "chat.done", "turn_id": "turn-1"}]


@pytest.mark.anyio
async def test_dispatch_chat_turn_maps_home_stream_failure(monkeypatch):
    websocket = RecordingWebSocket()
    required_scopes = []

    async def require_access(*, user, scope):
        required_scopes.append((user, scope))

    class FailingHomeReplies:
        async def stream(self, *_args):
            raise RuntimeError("当前用户已有 AI 对话正在处理中")

    async def stream_turn(websocket, *, scope, turn_id, event_stream):
        await event_stream(websocket.send_json)

    monkeypatch.setattr(
        chat_turns.chat_access,
        "require_ai_assistant_access",
        require_access,
    )
    monkeypatch.setattr(chat_turns, "hermes_home_replies", FailingHomeReplies())
    monkeypatch.setattr(chat_turns, "stream_chat_turn", stream_turn)

    user = {"username": "alice"}
    scope = ChatScope(kind="home")
    await chat_turns.dispatch_chat_turn(
        websocket,
        user=user,
        username="alice",
        current_scope=scope,
        message=ChatMessageIn(
            type="chat.message",
            text="hello",
            turn_id="turn-2",
        ),
    )

    assert required_scopes == [(user, scope)]
    assert websocket.events == [
        {
            "type": "chat.busy",
            "turn_id": "turn-2",
            "scope": {"kind": "home", "id": None},
            "message": "当前用户已有 AI 对话正在处理中",
        }
    ]


@pytest.mark.anyio
async def test_dispatch_chat_turn_reports_unsupported_scope(monkeypatch):
    websocket = RecordingWebSocket()
    required_scopes = []

    async def require_access(*, user, scope):
        required_scopes.append((user, scope))

    monkeypatch.setattr(
        chat_turns.chat_access,
        "require_ai_assistant_access",
        require_access,
    )

    user = {"username": "alice"}
    scope = ChatScope(kind="task", id="render-1")
    await chat_turns.dispatch_chat_turn(
        websocket,
        user=user,
        username="alice",
        current_scope=scope,
        message=ChatMessageIn(
            type="chat.message",
            text="status",
            turn_id="turn-3",
        ),
    )

    assert required_scopes == [(user, scope)]
    assert websocket.events == [
        {
            "type": "error",
            "turn_id": "turn-3",
            "message": "unsupported chat scope: task",
        }
    ]


@pytest.mark.anyio
async def test_dispatch_chat_turn_rejects_empty_message_before_access(monkeypatch):
    websocket = RecordingWebSocket()

    async def unexpected_access(**_kwargs):
        raise AssertionError("access check must not run for an empty message")

    monkeypatch.setattr(
        chat_turns.chat_access,
        "require_ai_assistant_access",
        unexpected_access,
    )
    monkeypatch.setattr(
        chat_turns.uuid,
        "uuid4",
        lambda: SimpleNamespace(hex="generated-turn"),
    )

    await chat_turns.dispatch_chat_turn(
        websocket,
        user={"username": "alice"},
        username="alice",
        current_scope=ChatScope(kind="home"),
        message=ChatMessageIn(type="chat.message", text="   "),
    )

    assert websocket.events == [
        {
            "type": "error",
            "turn_id": "generated-turn",
            "message": "empty message",
        }
    ]
