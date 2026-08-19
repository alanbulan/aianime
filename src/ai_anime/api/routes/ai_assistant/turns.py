"""Chat message dispatch and WebSocket projection adapter."""

from __future__ import annotations

import uuid
from pathlib import Path
from typing import Any

from fastapi import WebSocket

import ai_anime.api.routes.ai_assistant.access as chat_access
from ai_anime.api.routes.ai_assistant.errors import chat_exception_event
from ai_anime.api.routes.ai_assistant.schemas import (
    ChatAttachmentIn,
    ChatMessageIn,
    attachment_payloads,
    to_chat_scope,
)
from ai_anime.api.routes.ai_assistant.websocket import (
    ChatEventSink,
    send_json_best_effort,
    stream_chat_turn,
)
from ai_anime.modules.ai_assistant.public import (
    ChatScope,
    get_hermes_home_replies,
    get_conversation_titles,
    get_project_chat_turns,
)

hermes_home_replies = get_hermes_home_replies()
project_chat_turns = get_project_chat_turns()
conversation_titles = get_conversation_titles()


async def _stream_project_turn(
    *,
    websocket: WebSocket,
    username: str,
    scope: ChatScope,
    text: str,
    attachments: list[ChatAttachmentIn],
    turn_id: str,
    project_dir: str | Path | None,
    project_state_dir: str | Path | None,
) -> None:
    serialized_attachments = attachment_payloads(attachments)

    async def event_stream(on_event: ChatEventSink) -> None:
        await project_chat_turns.stream(
            username,
            scope,
            text,
            serialized_attachments,
            turn_id,
            on_event,
            project_dir=project_dir,
            project_state_dir=project_state_dir,
        )

    await stream_chat_turn(
        websocket,
        scope=scope,
        turn_id=turn_id,
        event_stream=event_stream,
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
    serialized_attachments = attachment_payloads(attachments)

    async def event_stream(on_event: ChatEventSink) -> None:
        await hermes_home_replies.stream(
            username,
            scope,
            text,
            serialized_attachments,
            turn_id,
            on_event,
        )

    await stream_chat_turn(
        websocket,
        scope=scope,
        turn_id=turn_id,
        event_stream=event_stream,
    )


async def dispatch_chat_turn(
    websocket: WebSocket,
    *,
    user: dict[str, Any],
    username: str,
    current_scope: ChatScope,
    message: ChatMessageIn,
) -> None:
    turn_id = (message.turn_id or "").strip() or uuid.uuid4().hex
    # Resolved before the guarded block below because the failure handler
    # reports against `scope`. A client-supplied scope can be invalid, and
    # letting that ValueError escape would tear down the whole session.
    try:
        scope = to_chat_scope(message.scope) if message.scope else current_scope
    except ValueError as exc:
        await send_json_best_effort(
            websocket,
            {
                "type": "error",
                "turn_id": turn_id,
                "message": f"unsupported chat scope: {exc}",
            },
        )
        return
    text = message.text.strip()
    if not text:
        await send_json_best_effort(
            websocket,
            {"type": "error", "turn_id": turn_id, "message": "empty message"},
        )
        return

    try:
        project_ctx = await chat_access.require_ai_assistant_access(
            user=user,
            scope=scope,
        )
        project_dir = project_ctx.output_dir if project_ctx is not None else None
        project_state_dir = project_ctx.state_dir if project_ctx is not None else None
        conversation_titles.schedule(
            username,
            scope,
            text,
            project_dir=project_dir,
            project_state_dir=project_state_dir,
        )
        if scope.kind == "project":
            await _stream_project_turn(
                websocket=websocket,
                username=username,
                scope=scope,
                text=text,
                attachments=message.attachments,
                turn_id=turn_id,
                project_dir=project_dir,
                project_state_dir=project_state_dir,
            )
        elif scope.kind == "home":
            await _stream_home_turn(
                websocket=websocket,
                username=username,
                scope=scope,
                text=text,
                attachments=message.attachments,
                turn_id=turn_id,
            )
        else:
            await send_json_best_effort(
                websocket,
                {
                    "type": "error",
                    "turn_id": turn_id,
                    "message": f"unsupported chat scope: {scope.kind}",
                },
            )
    except Exception as exc:  # noqa: BLE001
        await send_json_best_effort(
            websocket,
            chat_exception_event(exc, turn_id=turn_id, scope=scope),
        )


__all__ = ["dispatch_chat_turn"]
