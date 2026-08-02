"""Chat WebSocket connection lifecycle and inbound event dispatch."""

from __future__ import annotations

from fastapi import WebSocket, WebSocketDisconnect

import ai_anime.api.chat_scope as chat_scope
import ai_anime.api.chat_turns as chat_turns
from ai_anime.api.auth import get_websocket_user
from ai_anime.api.chat_schemas import ChatMessageIn, ScopeSetIn, to_chat_scope
from ai_anime.api.chat_websocket import send_json_best_effort
from ai_anime.modules.ai_assistant.public import (
    ChatScope,
    get_chat_worker_lifecycle,
    get_hermes_runtime_prewarmer,
    should_prewarm_scope,
)

hermes_runtime_prewarmer = get_hermes_runtime_prewarmer()
chat_worker_lifecycle = get_chat_worker_lifecycle()


async def run_chat_session(websocket: WebSocket) -> None:
    await websocket.accept()
    try:
        user = await get_websocket_user(websocket)
    except Exception:
        await websocket.send_json({"type": "error", "message": "unauthorized"})
        await websocket.close(code=1008)
        return

    username = str(user["username"])
    current_scope = ChatScope(kind="home")
    current_scope = await chat_scope.send_scope_changed(
        websocket,
        user,
        username,
        current_scope,
    )
    if current_scope is None:
        return
    # The client commonly selects a project immediately after connecting.
    # Avoid creating and then rotating an unnecessary home worker first.
    if should_prewarm_scope(current_scope.kind):
        await hermes_runtime_prewarmer.prewarm(
            username,
            project=current_scope.id if current_scope.kind == "project" else None,
        )

    try:
        while True:
            try:
                raw = await websocket.receive_json()
            except RuntimeError as exc:
                if "WebSocket is not connected" in str(exc):
                    return
                raise
            event_type = str(raw.get("type") or "")
            if event_type == "scope.set":
                message = ScopeSetIn.model_validate(raw)
                requested_scope = to_chat_scope(message.scope)
                current_scope = await chat_scope.send_scope_changed(
                    websocket,
                    user,
                    username,
                    requested_scope,
                )
                if current_scope is None:
                    return
                await chat_worker_lifecycle.sync_scope(username, current_scope)
                await hermes_runtime_prewarmer.prewarm(
                    username,
                    project=current_scope.id
                    if current_scope.kind == "project"
                    else None,
                )
                continue

            if event_type != "chat.message":
                await send_json_best_effort(
                    websocket,
                    {"type": "error", "message": f"unsupported event: {event_type}"},
                )
                continue

            message = ChatMessageIn.model_validate(raw)
            await chat_turns.dispatch_chat_turn(
                websocket,
                user=user,
                username=username,
                current_scope=current_scope,
                message=message,
            )
    except WebSocketDisconnect:
        return


__all__ = ["run_chat_session"]
