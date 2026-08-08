"""HTTP endpoints for Chat cancellation and persisted UI messages."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException

import ai_anime.api.routes.ai_assistant.access as chat_access
from ai_anime.api.routes.identity_access.dependencies import get_api_user
from ai_anime.api.routes.ai_assistant.schemas import (
    ChatNotificationIn,
    ChatUiEventIn,
    to_chat_scope,
)
from ai_anime.modules.ai_assistant.public import (
    get_chat_worker_lifecycle,
    get_scoped_chat_messages,
)

router = APIRouter()

chat_worker_lifecycle = get_chat_worker_lifecycle()
scoped_chat_messages = get_scoped_chat_messages()


@router.post("/chat/cancel")
async def cancel_chat_turn(user: dict = Depends(get_api_user)) -> dict[str, Any]:
    """Best-effort cancellation for the active Hermes chat worker.

    The WebSocket receive loop is blocked while a Hermes prompt is streaming,
    so a separate HTTP endpoint gives the frontend an out-of-band stop signal.
    Closing the worker is intentionally coarse, but it is the only reliable way
    to interrupt long-running tool calls with the current Hermes ACP wrapper.
    """
    username = str(user["username"])
    cancelled = await chat_worker_lifecycle.cancel(username)
    return {"ok": True, "data": {"cancelled": cancelled}}


@router.post("/chat/notifications")
async def append_chat_notification(
    payload: ChatNotificationIn,
    user: dict = Depends(get_api_user),
) -> dict[str, Any]:
    username = str(user["username"])
    scope = to_chat_scope(payload.scope)
    text = payload.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="text is required")
    if len(text) > 4000:
        raise HTTPException(status_code=400, detail="text is too long")

    project_ctx = await chat_access.project_context_for_scope(user, scope)
    if scope.kind == "project" and not scope.id:
        raise HTTPException(status_code=400, detail="project scope id is required")
    message = scoped_chat_messages.append_notification(
        username,
        scope,
        text,
        project_dir=project_ctx.output_dir if project_ctx is not None else None,
        project_state_dir=project_ctx.state_dir if project_ctx is not None else None,
    )
    return {"ok": True, "data": message}


@router.post("/chat/ui-events")
async def append_chat_ui_event(
    payload: ChatUiEventIn,
    user: dict = Depends(get_api_user),
) -> dict[str, Any]:
    username = str(user["username"])
    scope = to_chat_scope(payload.scope)
    if scope.kind == "project":
        await chat_access.project_context_for_scope(user, scope)
    turn_id = payload.turn_id.strip()
    if not turn_id:
        raise HTTPException(status_code=400, detail="turn_id is required")
    try:
        event = scoped_chat_messages.append_ui_event(
            username,
            scope,
            turn_id,
            payload.event,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"ok": True, "data": event}


__all__ = ["router"]
