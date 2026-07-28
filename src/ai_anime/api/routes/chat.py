"""WebSocket chat endpoint for the React frontend.

Transport contract is typed JSON events. The backend keeps chat storage and
agent process management behind this endpoint so ai-anime-fe does not need to
know whether the active backend is Hermes, Claude, or Codex.
"""

from __future__ import annotations

import asyncio
import contextlib
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from ai_anime.api.auth import (
    AUTH_COOKIE_NAME,
    get_api_user,
    _verify_agent_bearer,
    _verify_browser_session,
)
from ai_anime.chat import service as chat_service
from ai_anime.modules.ai_assistant.public import (
    ChatScope,
    get_chat_history,
    get_chat_run_locks,
    get_hermes_home_replies,
    get_hermes_runtime,
    get_project_assistant_replies,
    get_project_chat_messages,
    message_content,
    should_emit_final_text,
    should_prewarm_scope,
    text_with_attachment_context,
    tool_display_payload,
)
from ai_anime.modules.project_workspace.public import (
    ProjectNotFound,
)
from ai_anime.modules.model_usage.public import get_usage_meter
from ai_anime.modules.project_workspace.public import (
    ProjectContext,
    resolve_project_context,
)
from ai_anime.modules.model_usage.public import (
    BILLING_RULE_NOT_CONFIGURED_MESSAGE,
    INSUFFICIENT_CREDITS_MESSAGE,
    billing_rule_not_configured_payload,
    find_billing_rule_not_configured_error,
    find_insufficient_credits_error,
    insufficient_credits_payload,
)

router = APIRouter()

AI_ASSISTANT_CHAT_FEATURE_KEY = "ai_assistant_chat"
chat_history = get_chat_history()
chat_run_locks = get_chat_run_locks()
hermes_home_replies = get_hermes_home_replies()
hermes_runtime = get_hermes_runtime()
project_assistant_replies = get_project_assistant_replies()
project_chat_messages = get_project_chat_messages()


@router.post("/chat/cancel")
async def cancel_chat_turn(user: dict = Depends(get_api_user)) -> dict[str, Any]:
    """Best-effort cancellation for the active Hermes chat worker.

    The WebSocket receive loop is blocked while a Hermes prompt is streaming,
    so a separate HTTP endpoint gives the frontend an out-of-band stop signal.
    Closing the worker is intentionally coarse, but it is the only reliable way
    to interrupt long-running tool calls with the current Hermes ACP wrapper.
    """
    username = str(user["username"])
    try:
        cancelled = await hermes_runtime.close_user(username)
    except Exception:
        cancelled = False
    try:
        chat_run_locks.force_release(username, "")
    except Exception:
        pass
    return {"ok": True, "data": {"cancelled": cancelled}}


class ChatScopePayload(BaseModel):
    kind: str = "home"
    id: str | None = None


class ChatAttachmentIn(BaseModel):
    id: str | None = None
    type: str | None = None
    kind: str | None = None
    mimeType: str | None = None
    fileName: str | None = None
    fileSize: int | None = None
    content: str | None = None
    url: str | None = None
    path: str | None = None
    label: str | None = None


class ChatMessageIn(BaseModel):
    type: str
    scope: ChatScopePayload | None = None
    text: str
    turn_id: str | None = None
    attachments: list[ChatAttachmentIn] = []


class ScopeSetIn(BaseModel):
    type: str
    scope: ChatScopePayload


class ChatUiEventIn(BaseModel):
    scope: ChatScopePayload
    turn_id: str
    event: dict[str, Any]


class ChatNotificationIn(BaseModel):
    scope: ChatScopePayload | None = None
    text: str


@router.post("/chat/notifications")
async def append_chat_notification(
    payload: ChatNotificationIn,
    user: dict = Depends(get_api_user),
) -> dict[str, Any]:
    username = str(user["username"])
    scope = _scope_from_model(payload.scope)
    text = payload.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="text is required")
    if len(text) > 4000:
        raise HTTPException(status_code=400, detail="text is too long")

    if scope.kind == "project":
        project_ctx = await _project_context_for_scope(user, scope)
        if not scope.id:
            raise HTTPException(status_code=400, detail="project scope id is required")
        message = project_chat_messages.append_assistant(
            username,
            str(scope.id),
            text,
            project_dir=project_ctx.output_dir if project_ctx is not None else None,
            project_state_dir=project_ctx.state_dir
            if project_ctx is not None
            else None,
        )
    else:
        message = chat_history.append_message(username, scope, "assistant", text)
    return {"ok": True, "data": message}


@router.post("/chat/ui-events")
async def append_chat_ui_event(
    payload: ChatUiEventIn,
    user: dict = Depends(get_api_user),
) -> dict[str, Any]:
    username = str(user["username"])
    scope = _scope_from_model(payload.scope)
    if scope.kind == "project":
        await _project_context_for_scope(user, scope)
    turn_id = payload.turn_id.strip()
    if not turn_id:
        raise HTTPException(status_code=400, detail="turn_id is required")
    try:
        event = chat_history.append_ui_event(username, scope, turn_id, payload.event)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"ok": True, "data": event}


async def _authenticate_ws(websocket: WebSocket) -> dict[str, Any]:
    bearer = websocket.headers.get("Authorization", "").strip()
    if bearer:
        token = (
            bearer.partition(" ")[2].strip()
            if bearer.lower().startswith("bearer ")
            else ""
        )
        if token:
            return await _verify_agent_bearer(token)

    cookie_value = websocket.cookies.get(AUTH_COOKIE_NAME)
    return await _verify_browser_session(cookie_value)


def _scope_from_model(model: ChatScopePayload | None) -> ChatScope:
    return ChatScope.from_payload(model.model_dump() if model else None)


def _attachment_payloads(attachments: list[ChatAttachmentIn]) -> list[dict[str, Any]]:
    payloads: list[dict[str, Any]] = []
    for attachment in attachments:
        payload = attachment.model_dump(exclude_none=True)
        if payload:
            payloads.append(payload)
    return payloads


async def _project_context_for_scope(
    user: dict[str, Any], scope: ChatScope
) -> ProjectContext | None:
    if scope.kind != "project" or not scope.id:
        return None
    return await resolve_project_context(
        user=user,
        project_id=str(scope.id),
        required_role="viewer",
    )


async def _requester_user_id_for_chat(user: dict[str, Any], scope: ChatScope) -> str:
    if scope.kind == "project":
        project_ctx = await _project_context_for_scope(user, scope)
        if project_ctx is not None and project_ctx.requester_user_id:
            return project_ctx.requester_user_id
    user_id = str(user.get("id") or user.get("user_id") or "").strip()
    if user_id:
        return user_id
    return str(user.get("username") or "").strip()


async def _require_ai_assistant_access(
    *,
    user: dict[str, Any],
    scope: ChatScope,
) -> None:
    user_id = await _requester_user_id_for_chat(user, scope)
    await get_usage_meter().require_feature_credit_balance(
        user_id=user_id,
        feature_key=AI_ASSISTANT_CHAT_FEATURE_KEY,
        project_id=str(scope.id or "") if scope.kind == "project" else "",
        resource_kind="chat",
        metadata={"scope": scope.to_dict()},
    )


async def _history(
    username: str,
    scope: ChatScope,
    *,
    project_ctx: ProjectContext | None = None,
) -> list[dict[str, Any]]:
    if scope.kind == "project":
        return project_chat_messages.list(
            username,
            str(scope.id),
            project_dir=project_ctx.output_dir if project_ctx is not None else None,
            project_state_dir=project_ctx.state_dir
            if project_ctx is not None
            else None,
        )
    return chat_history.list_messages(username, scope)


async def _send_scope_changed(
    websocket: WebSocket,
    user: dict[str, Any],
    username: str,
    scope: ChatScope,
) -> ChatScope | None:
    try:
        project_ctx = await _project_context_for_scope(user, scope)
    except ProjectNotFound:
        if scope.kind != "project":
            raise
        scope = ChatScope(kind="home")
        project_ctx = None
        if not await _send_json_best_effort(
            websocket,
            {"type": "error", "message": "项目不存在或已删除，已切回首页聊天。"},
        ):
            return None
    if not await _send_json_best_effort(
        websocket,
        {
            "type": "scope.changed",
            "scope": scope.to_dict(),
            "history": await _history(username, scope, project_ctx=project_ctx),
            "busy": chat_run_locks.is_active(username),
        },
    ):
        return None
    return scope


async def _send_json_best_effort(
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
    interval_seconds: float = 10.0,
) -> None:
    while True:
        await asyncio.sleep(interval_seconds)
        sent = await _send_json_best_effort(
            websocket,
            {"type": "chat.ping", "turn_id": turn_id, "scope": scope.to_dict()},
            send_lock,
        )
        if not sent:
            return


async def _sync_running_agent_scope(username: str, scope: ChatScope) -> None:
    try:
        await hermes_runtime.set_scope_for_user(
            username,
            scope_kind=scope.kind,
            project_id=scope.id if scope.kind == "project" else None,
        )
    except Exception:
        # Scope switching should not spawn or break the UI if Hermes is absent.
        return


async def _stream_project_turn(
    *,
    websocket: WebSocket,
    user: dict[str, Any],
    username: str,
    scope: ChatScope,
    text: str,
    attachments: list[ChatAttachmentIn],
    turn_id: str,
) -> None:
    project = str(scope.id)
    project_ctx = await _project_context_for_scope(user, scope)
    project_dir = project_ctx.output_dir if project_ctx is not None else None
    project_state_dir = project_ctx.state_dir if project_ctx is not None else None
    attachment_payloads = _attachment_payloads(attachments)
    agent_text = text_with_attachment_context(text, attachment_payloads)
    project_chat_messages.append_user(
        username,
        project,
        text,
        project_dir=project_dir,
        project_state_dir=project_state_dir,
    )
    send_lock = asyncio.Lock()
    heartbeat_task = asyncio.create_task(
        _chat_heartbeat(websocket, scope=scope, turn_id=turn_id, send_lock=send_lock)
    )
    done_sent = False
    assistant_sent_text = ""

    async def on_event(event: dict[str, Any]) -> None:
        nonlocal assistant_sent_text, done_sent
        event_type = event.get("type")
        if event_type == "thread_started":
            await _send_json_best_effort(
                websocket,
                {
                    "type": "thread.started",
                    "scope": scope.to_dict(),
                    "thread_id": event.get("thread_id"),
                    "turn_id": event.get("turn_id") or turn_id,
                },
                send_lock,
            )
        elif event_type == "assistant_delta":
            assistant_sent_text = str(event.get("text") or "")
            await _send_json_best_effort(
                websocket,
                {
                    "type": "assistant.delta",
                    "text": assistant_sent_text,
                    "turn_id": turn_id,
                    "accumulated": True,
                },
                send_lock,
            )
        elif event_type == "tool_update":
            tool_name, tool_body = tool_display_payload(
                event.get("text"), event.get("name")
            )
            await _send_json_best_effort(
                websocket,
                {
                    "type": "tool.result",
                    "turn_id": turn_id,
                    "name": tool_name,
                    "success": True,
                    "result": {"text": tool_body},
                    "error": None,
                },
                send_lock,
            )
        elif event_type == "assistant_message":
            message = event.get("message")
            if isinstance(message, dict):
                assistant_sent_text = message_content(message)
                await _send_json_best_effort(
                    websocket,
                    {
                        "type": "assistant.message",
                        "turn_id": turn_id,
                        "message": message,
                    },
                    send_lock,
                )
        elif event_type == "done":
            final_text = message_content(event.get("message"))
            if should_emit_final_text(final_text, assistant_sent_text):
                assistant_sent_text = final_text
                await _send_json_best_effort(
                    websocket,
                    {
                        "type": "assistant.delta",
                        "text": final_text,
                        "turn_id": turn_id,
                        "accumulated": True,
                    },
                    send_lock,
                )
            done_sent = await _send_json_best_effort(
                websocket,
                {"type": "chat.done", "turn_id": turn_id, "scope": scope.to_dict()},
                send_lock,
            )

    try:
        await project_assistant_replies.stream(
            username,
            project,
            agent_text,
            on_event,
            project_dir=project_dir,
            project_state_dir=project_state_dir,
        )
    finally:
        heartbeat_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await heartbeat_task
        if not done_sent:
            await _send_json_best_effort(
                websocket,
                {"type": "chat.done", "turn_id": turn_id, "scope": scope.to_dict()},
                send_lock,
            )


async def _stream_home_turn(
    *,
    websocket: WebSocket,
    username: str,
    scope: ChatScope,
    text: str,
    attachments: list[ChatAttachmentIn],
    turn_id: str,
) -> None:
    attachment_payloads = _attachment_payloads(attachments)
    send_lock = asyncio.Lock()
    heartbeat_task = asyncio.create_task(
        _chat_heartbeat(websocket, scope=scope, turn_id=turn_id, send_lock=send_lock)
    )

    async def on_event(event: dict[str, Any]) -> None:
        async with send_lock:
            await websocket.send_json(event)

    try:
        await hermes_home_replies.stream(
            username,
            scope,
            text,
            attachment_payloads,
            turn_id,
            on_event,
        )
    finally:
        heartbeat_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await heartbeat_task


@router.websocket("/chat/ws")
async def chat_ws(websocket: WebSocket) -> None:
    await websocket.accept()
    try:
        user = await _authenticate_ws(websocket)
    except Exception:
        await websocket.send_json({"type": "error", "message": "unauthorized"})
        await websocket.close(code=1008)
        return

    username = str(user["username"])
    current_scope = ChatScope(kind="home")
    current_scope = await _send_scope_changed(websocket, user, username, current_scope)
    if current_scope is None:
        return
    # Do not pre-warm the default home scope on connect. The React client often
    # immediately sends scope.set for the active project; warming home first
    # creates a worker that is then rotated and logs a noisy initialize timeout.
    if should_prewarm_scope(current_scope.kind):
        await chat_service.prewarm_chat_backend(
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
                requested_scope = _scope_from_model(msg.scope)
                current_scope = await _send_scope_changed(
                    websocket, user, username, requested_scope
                )
                if current_scope is None:
                    return
                await _sync_running_agent_scope(username, current_scope)
                # Switching project rotates the worker; warm the new scope now so
                # the first message in the project doesn't cold-start.
                await chat_service.prewarm_chat_backend(
                    username,
                    project=current_scope.id
                    if current_scope.kind == "project"
                    else None,
                )
                continue

            if event_type != "chat.message":
                await _send_json_best_effort(
                    websocket,
                    {"type": "error", "message": f"unsupported event: {event_type}"},
                )
                continue

            msg = ChatMessageIn.model_validate(raw)
            scope = _scope_from_model(msg.scope) if msg.scope else current_scope
            turn_id = (msg.turn_id or "").strip() or uuid.uuid4().hex
            text = msg.text.strip()
            if not text:
                await _send_json_best_effort(
                    websocket,
                    {"type": "error", "turn_id": turn_id, "message": "empty message"},
                )
                continue

            try:
                await _require_ai_assistant_access(user=user, scope=scope)
                if scope.kind == "project":
                    await _stream_project_turn(
                        websocket=websocket,
                        user=user,
                        username=username,
                        scope=scope,
                        text=text,
                        attachments=msg.attachments,
                        turn_id=turn_id,
                    )
                elif scope.kind == "home":
                    await _stream_home_turn(
                        websocket=websocket,
                        username=username,
                        scope=scope,
                        text=text,
                        attachments=msg.attachments,
                        turn_id=turn_id,
                    )
                else:
                    await _send_json_best_effort(
                        websocket,
                        {
                            "type": "error",
                            "turn_id": turn_id,
                            "message": f"scope not implemented: {scope.kind}",
                        },
                    )
            except Exception as exc:  # noqa: BLE001
                message = str(exc)
                if "当前用户已有 AI 对话正在处理中" in message:
                    await _send_json_best_effort(
                        websocket,
                        {
                            "type": "chat.busy",
                            "turn_id": turn_id,
                            "scope": scope.to_dict(),
                            "message": message,
                        },
                    )
                    continue
                billing_rule_error = find_billing_rule_not_configured_error(exc)
                if billing_rule_error is not None:
                    await _send_json_best_effort(
                        websocket,
                        {
                            "type": "error",
                            "turn_id": turn_id,
                            "message": BILLING_RULE_NOT_CONFIGURED_MESSAGE,
                            "data": billing_rule_not_configured_payload(
                                billing_rule_error
                            ),
                        },
                    )
                    continue
                insufficient_error = find_insufficient_credits_error(exc)
                if insufficient_error is not None:
                    await _send_json_best_effort(
                        websocket,
                        {
                            "type": "error",
                            "turn_id": turn_id,
                            "message": INSUFFICIENT_CREDITS_MESSAGE,
                            "data": insufficient_credits_payload(insufficient_error),
                        },
                    )
                    continue
                await _send_json_best_effort(
                    websocket, {"type": "error", "turn_id": turn_id, "message": message}
                )
    except WebSocketDisconnect:
        return
