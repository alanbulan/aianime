"""Chat WebSocket connection lifecycle and inbound event dispatch."""

from __future__ import annotations

from fastapi import WebSocket, WebSocketDisconnect

import ai_anime.api.routes.ai_assistant.scope as chat_scope
import ai_anime.api.routes.ai_assistant.turns as chat_turns
import ai_anime.api.routes.ai_assistant.access as chat_access
from ai_anime.api.routes.identity_access.dependencies import get_websocket_user
from ai_anime.api.routes.ai_assistant.schemas import (
    ChatMessageIn,
    ConversationDeleteIn,
    ScopeSetIn,
    to_chat_scope,
)
from ai_anime.api.routes.ai_assistant.websocket import send_json_best_effort
from ai_anime.modules.ai_assistant.public import (
    ChatScope,
    get_chat_worker_lifecycle,
    get_hermes_runtime_prewarmer,
    get_scoped_chat_messages,
    should_prewarm_scope,
)

hermes_runtime_prewarmer = get_hermes_runtime_prewarmer()
chat_worker_lifecycle = get_chat_worker_lifecycle()
scoped_chat_messages = get_scoped_chat_messages()


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
            conversation_id=current_scope.conversation_id,
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
            if event_type == "conversation.delete":
                message = ConversationDeleteIn.model_validate(raw)
                requested_scope = to_chat_scope(message.scope)
                target_scope = ChatScope(
                    kind=requested_scope.kind,
                    id=requested_scope.id,
                    conversation_id=message.conversationId,
                )
                try:
                    if chat_worker_lifecycle.is_busy(username):
                        await send_json_best_effort(
                            websocket,
                            {
                                "type": "error",
                                "message": "当前会话正在执行任务，暂时无法删除。",
                            },
                        )
                        continue
                    project_ctx = await chat_access.project_context_for_scope(
                        user,
                        target_scope,
                    )
                    scoped_chat_messages.delete_conversation(
                        username,
                        target_scope,
                        project_dir=(
                            project_ctx.output_dir
                            if project_ctx is not None
                            else None
                        ),
                        project_state_dir=(
                            project_ctx.state_dir
                            if project_ctx is not None
                            else None
                        ),
                    )
                    await chat_worker_lifecycle.forget_conversation(
                        username,
                        target_scope,
                    )
                    await send_json_best_effort(
                        websocket,
                        {
                            "type": "conversation.deleted",
                            "conversationId": target_scope.conversation_id,
                            "conversations": (
                                scoped_chat_messages.list_conversations(
                                    username,
                                    requested_scope,
                                    project_dir=(
                                        project_ctx.output_dir
                                        if project_ctx is not None
                                        else None
                                    ),
                                    project_state_dir=(
                                        project_ctx.state_dir
                                        if project_ctx is not None
                                        else None
                                    ),
                                )
                            ),
                        },
                    )
                except Exception:
                    await send_json_best_effort(
                        websocket,
                        {"type": "error", "message": "删除会话失败。"},
                    )
                continue

            if event_type == "scope.set":
                message = ScopeSetIn.model_validate(raw)
                requested_scope = to_chat_scope(message.scope)
                previous_scope = current_scope
                current_scope = await chat_scope.send_scope_changed(
                    websocket,
                    user,
                    username,
                    requested_scope,
                )
                if current_scope is None:
                    return
                is_history_refresh = (
                    requested_scope == previous_scope == current_scope
                )
                if (
                    not is_history_refresh
                    and not chat_worker_lifecycle.is_busy(username)
                ):
                    await chat_worker_lifecycle.sync_scope(username, current_scope)
                    await hermes_runtime_prewarmer.prewarm(
                        username,
                        project=current_scope.id
                        if current_scope.kind == "project"
                        else None,
                        conversation_id=current_scope.conversation_id,
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
