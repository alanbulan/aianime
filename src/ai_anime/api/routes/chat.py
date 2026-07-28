"""WebSocket chat endpoint for the React frontend.

Transport contract is typed JSON events. The backend keeps chat storage and
agent process management behind this endpoint so ai-anime-fe does not need to
know whether the active backend is Hermes, Claude, or Codex.
"""

from __future__ import annotations

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

import ai_anime.api.chat_scope as chat_scope
import ai_anime.api.chat_turns as chat_turns
from ai_anime.api.auth import get_websocket_user
from ai_anime.api.chat_schemas import (
    ChatMessageIn,
    ScopeSetIn,
    to_chat_scope,
)
from ai_anime.api.chat_websocket import send_json_best_effort
from ai_anime.modules.ai_assistant.public import (
    ChatScope,
    get_agent_backend_prewarmer,
    get_chat_worker_lifecycle,
    should_prewarm_scope,
)

router = APIRouter()

agent_backend_prewarmer = get_agent_backend_prewarmer()
chat_worker_lifecycle = get_chat_worker_lifecycle()


@router.websocket("/chat/ws")
async def chat_ws(websocket: WebSocket) -> None:
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
    # Do not pre-warm the default home scope on connect. The React client often
    # immediately sends scope.set for the active project; warming home first
    # creates a worker that is then rotated and logs a noisy initialize timeout.
    if should_prewarm_scope(current_scope.kind):
        await agent_backend_prewarmer.prewarm(
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
                msg = ScopeSetIn.model_validate(raw)
                requested_scope = to_chat_scope(msg.scope)
                current_scope = await chat_scope.send_scope_changed(
                    websocket, user, username, requested_scope
                )
                if current_scope is None:
                    return
                await chat_worker_lifecycle.sync_scope(username, current_scope)
                # Switching project rotates the worker; warm the new scope now so
                # the first message in the project doesn't cold-start.
                await agent_backend_prewarmer.prewarm(
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

            msg = ChatMessageIn.model_validate(raw)
            await chat_turns.dispatch_chat_turn(
                websocket,
                user=user,
                username=username,
                current_scope=current_scope,
                message=msg,
            )
    except WebSocketDisconnect:
        return
