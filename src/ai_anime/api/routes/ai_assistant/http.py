"""HTTP endpoints for Chat cancellation and persisted UI messages."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException

import ai_anime.api.routes.ai_assistant.access as chat_access
from ai_anime.api.routes.identity_access.dependencies import get_api_user
from ai_anime.api.routes.ai_assistant.schemas import (
    ChatNotificationIn,
    ChatSlashCommandIn,
    ChatUiEventIn,
    DecisionCreateIn,
    DecisionResolveIn,
    MessageContextUpdateIn,
    decision_answer_payloads,
    decision_question_payloads,
    to_chat_scope,
)
from ai_anime.modules.ai_assistant.public import (
    ChatDecisionCancelled,
    ChatDecisionInvalid,
    ChatDecisionNotFound,
    ChatDecisionUnavailable,
    get_chat_decisions,
    get_chat_worker_lifecycle,
    get_hermes_session_commands,
    get_scoped_chat_messages,
)

router = APIRouter()

chat_worker_lifecycle = get_chat_worker_lifecycle()
chat_decisions = get_chat_decisions()
scoped_chat_messages = get_scoped_chat_messages()
hermes_session_commands = get_hermes_session_commands()


@router.post("/chat/cancel")
async def cancel_chat_turn(user: dict = Depends(get_api_user)) -> dict[str, Any]:
    """Best-effort cancellation for the active Hermes chat worker.

    The WebSocket receive loop is blocked while a Hermes prompt is streaming,
    so a separate HTTP endpoint gives the frontend an out-of-band stop signal.
    Closing the worker is intentionally coarse, but it is the only reliable way
    to interrupt long-running tool calls with the current Hermes ACP wrapper.
    """
    username = str(user["username"])
    cancelled_decisions = await chat_decisions.cancel_for_user(username)
    cancelled = await chat_worker_lifecycle.cancel(username)
    return {
        "ok": True,
        "data": {
            "cancelled": cancelled,
            "cancelled_decisions": cancelled_decisions,
        },
    }


@router.post("/chat/decisions")
async def create_chat_decision(
    payload: DecisionCreateIn,
    user: dict = Depends(get_api_user),
) -> dict[str, Any]:
    """Block an agent tool call until the matching browser user answers."""

    if user.get("credential_kind") != "agent_session":
        raise HTTPException(status_code=403, detail="agent session required")
    try:
        result = await chat_decisions.ask(
            str(user["username"]),
            project_id=payload.project_id,
            title=payload.title,
            questions=decision_question_payloads(payload.questions),
            source=payload.source,
        )
    except ChatDecisionUnavailable as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ChatDecisionCancelled as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return {"ok": True, "data": result}


@router.post("/chat/decisions/{decision_id}/resolve")
async def resolve_chat_decision(
    decision_id: str,
    payload: DecisionResolveIn,
    user: dict = Depends(get_api_user),
) -> dict[str, Any]:
    try:
        result = await chat_decisions.resolve(
            str(user["username"]),
            decision_id,
            decision_answer_payloads(payload.answers),
        )
    except ChatDecisionNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ChatDecisionInvalid as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"ok": True, "data": result}


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


@router.post("/chat/commands")
async def execute_chat_command(
    payload: ChatSlashCommandIn,
    user: dict = Depends(get_api_user),
) -> dict[str, Any]:
    """Execute a structured Slash command without adding chat messages."""

    username = str(user["username"])
    scope = to_chat_scope(payload.scope)
    await chat_access.project_context_for_scope(user, scope)
    if chat_worker_lifecycle.is_busy(username):
        raise HTTPException(
            status_code=409,
            detail="当前对话正在执行任务，请在本轮结束后再运行命令。",
        )
    try:
        result = await hermes_session_commands.execute(
            username,
            scope,
            payload.command,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"命令执行失败：{exc}",
        ) from exc
    data: dict[str, Any] = {
        "command": payload.command,
        "text": result.text,
    }
    if result.usage is not None:
        data["usage"] = {
            "used": result.usage.used,
            "size": result.usage.size,
        }
    return {"ok": True, "data": data}


@router.post("/chat/ui-events")
async def append_chat_ui_event(
    payload: ChatUiEventIn,
    user: dict = Depends(get_api_user),
) -> dict[str, Any]:
    username = str(user["username"])
    scope = to_chat_scope(payload.scope)
    project_ctx = None
    if scope.kind == "project":
        project_ctx = await chat_access.project_context_for_scope(user, scope)
    turn_id = payload.turn_id.strip()
    if not turn_id:
        raise HTTPException(status_code=400, detail="turn_id is required")
    try:
        project_kwargs = {
            key: value
            for key, value in {
                "project_dir": getattr(project_ctx, "output_dir", None),
                "project_state_dir": getattr(project_ctx, "state_dir", None),
            }.items()
            if value is not None
        }
        event = scoped_chat_messages.append_ui_event(
            username,
            scope,
            turn_id,
            payload.event,
            **project_kwargs,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"ok": True, "data": event}


@router.patch("/chat/messages/{message_id}/context")
async def update_chat_message_context(
    message_id: str,
    payload: MessageContextUpdateIn,
    user: dict = Depends(get_api_user),
) -> dict[str, Any]:
    username = str(user["username"])
    scope = to_chat_scope(payload.scope)
    project_ctx = await chat_access.project_context_for_scope(user, scope)
    try:
        result = scoped_chat_messages.set_context_state(
            username,
            scope,
            message_id,
            payload.state,
            project_dir=(
                project_ctx.output_dir if project_ctx is not None else None
            ),
            project_state_dir=(
                project_ctx.state_dir if project_ctx is not None else None
            ),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if result is None:
        raise HTTPException(status_code=404, detail="chat message not found")
    return {"ok": True, "data": result}


__all__ = ["router"]
