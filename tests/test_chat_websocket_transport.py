import asyncio

import pytest

from ai_anime.api.routes.ai_assistant.websocket import (
    send_json_best_effort,
    stream_chat_turn,
)
from ai_anime.modules.ai_assistant.public import ChatScope


class RecordingWebSocket:
    def __init__(self):
        self.events = []

    async def send_json(self, payload):
        self.events.append(payload)


@pytest.mark.anyio
async def test_send_json_best_effort_reports_delivery_result():
    websocket = RecordingWebSocket()

    sent = await send_json_best_effort(websocket, {"type": "scope.changed"})

    assert sent is True
    assert websocket.events == [{"type": "scope.changed"}]


@pytest.mark.anyio
async def test_send_json_best_effort_isolates_disconnects():
    class DisconnectedWebSocket:
        async def send_json(self, _payload):
            raise RuntimeError("disconnected")

    sent = await send_json_best_effort(
        DisconnectedWebSocket(),
        {"type": "scope.changed"},
    )

    assert sent is False


@pytest.mark.anyio
async def test_stream_chat_turn_forwards_application_events():
    websocket = RecordingWebSocket()

    async def event_stream(on_event):
        await on_event({"type": "chat.delta", "text": "hello"})

    await stream_chat_turn(
        websocket,
        scope=ChatScope(kind="home"),
        turn_id="turn-1",
        event_stream=event_stream,
    )

    assert websocket.events == [{"type": "chat.delta", "text": "hello"}]


@pytest.mark.anyio
async def test_stream_chat_turn_emits_scoped_heartbeat():
    heartbeat_sent = asyncio.Event()
    websocket = RecordingWebSocket()

    async def send_json(payload):
        websocket.events.append(payload)
        if payload.get("type") == "chat.ping":
            heartbeat_sent.set()

    websocket.send_json = send_json

    async def event_stream(_on_event):
        await asyncio.wait_for(heartbeat_sent.wait(), timeout=1)

    await stream_chat_turn(
        websocket,
        scope=ChatScope(kind="project", id="project-a"),
        turn_id="turn-1",
        event_stream=event_stream,
        heartbeat_interval_seconds=0,
    )

    assert websocket.events == [
        {
            "type": "chat.ping",
            "turn_id": "turn-1",
                "scope": {
                    "kind": "project",
                    "id": "project-a",
                    "conversationId": "main",
                },
        }
    ]


@pytest.mark.anyio
async def test_stream_chat_turn_keeps_generating_after_client_disconnects(caplog):
    caplog.set_level(
        "INFO",
        logger="ai_anime.api.routes.ai_assistant.websocket",
    )
    send_attempts = 0

    class FailingWebSocket:
        async def send_json(self, _payload):
            nonlocal send_attempts
            send_attempts += 1
            raise RuntimeError("send failed")

    generated = []

    async def event_stream(on_event):
        generated.append("before-disconnect")
        await on_event({"type": "chat.delta", "text": "first"})
        generated.append("after-disconnect")
        await on_event({"type": "chat.delta", "text": "second"})
        generated.append("persisted")

    await stream_chat_turn(
        FailingWebSocket(),
        scope=ChatScope(kind="home"),
        turn_id="turn-1",
        event_stream=event_stream,
    )

    assert generated == ["before-disconnect", "after-disconnect", "persisted"]
    assert send_attempts == 1
    assert caplog.messages == [
        "chat websocket delivery closed; generation continues "
        "turn=turn-1 scope={'kind': 'home', 'id': None, 'conversationId': 'main'}"
    ]
