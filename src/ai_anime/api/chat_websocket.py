"""Transport helpers for Chat WebSocket events."""

from __future__ import annotations

import asyncio
import contextlib
from collections.abc import Awaitable, Callable
from typing import Any

from fastapi import WebSocket

from ai_anime.modules.ai_assistant.public import ChatScope

ChatEventSink = Callable[[dict[str, Any]], Awaitable[None]]
ChatEventStream = Callable[[ChatEventSink], Awaitable[None]]


async def send_json_best_effort(
    websocket: WebSocket,
    payload: dict[str, Any],
    send_lock: asyncio.Lock | None = None,
) -> bool:
    try:
        if send_lock is None:
            await websocket.send_json(payload)
        else:
            async with send_lock:
                await websocket.send_json(payload)
        return True
    except Exception:
        return False


async def _chat_heartbeat(
    websocket: WebSocket,
    *,
    scope: ChatScope,
    turn_id: str,
    send_lock: asyncio.Lock,
    interval_seconds: float,
) -> None:
    while True:
        await asyncio.sleep(interval_seconds)
        sent = await send_json_best_effort(
            websocket,
            {"type": "chat.ping", "turn_id": turn_id, "scope": scope.to_dict()},
            send_lock,
        )
        if not sent:
            return


async def stream_chat_turn(
    websocket: WebSocket,
    *,
    scope: ChatScope,
    turn_id: str,
    event_stream: ChatEventStream,
    heartbeat_interval_seconds: float = 10.0,
) -> None:
    send_lock = asyncio.Lock()
    heartbeat_task = asyncio.create_task(
        _chat_heartbeat(
            websocket,
            scope=scope,
            turn_id=turn_id,
            send_lock=send_lock,
            interval_seconds=heartbeat_interval_seconds,
        )
    )

    async def on_event(event: dict[str, Any]) -> None:
        async with send_lock:
            await websocket.send_json(event)

    try:
        await event_stream(on_event)
    finally:
        heartbeat_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await heartbeat_task


__all__ = ["ChatEventSink", "send_json_best_effort", "stream_chat_turn"]
