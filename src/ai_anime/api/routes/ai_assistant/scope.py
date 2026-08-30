"""Chat scope snapshot and WebSocket projection adapter."""

from __future__ import annotations

from typing import Any

from fastapi import WebSocket

import ai_anime.api.routes.ai_assistant.access as chat_access
from ai_anime.api.routes.ai_assistant.websocket import send_json_best_effort
from ai_anime.modules.ai_assistant.public import (
    ChatScope,
    get_chat_decisions,
    get_chat_worker_lifecycle,
    get_scoped_chat_messages,
    list_chat_slash_commands,
)
from ai_anime.modules.project_workspace.public import (
    ProjectContext,
    ProjectNotFound,
)

chat_worker_lifecycle = get_chat_worker_lifecycle()
chat_decisions = get_chat_decisions()
scoped_chat_messages = get_scoped_chat_messages()


async def _history(
    username: str,
    scope: ChatScope,
    *,
    project_ctx: ProjectContext | None = None,
) -> list[dict[str, Any]]:
    return scoped_chat_messages.list(
        username,
        scope,
        project_dir=project_ctx.output_dir if project_ctx is not None else None,
        project_state_dir=project_ctx.state_dir if project_ctx is not None else None,
    )


async def send_scope_changed(
    websocket: WebSocket,
    user: dict[str, Any],
    username: str,
    scope: ChatScope,
) -> ChatScope | None:
    try:
        project_ctx = await chat_access.project_context_for_scope(user, scope)
    except ProjectNotFound:
        if scope.kind != "project":
            raise
        scope = ChatScope(kind="home")
        project_ctx = None
        if not await send_json_best_effort(
            websocket,
            {"type": "error", "message": "项目不存在或已删除，已切回首页聊天。"},
        ):
            return None
    if not await send_json_best_effort(
        websocket,
        {
            "type": "scope.changed",
            "scope": scope.to_dict(),
            "history": await _history(username, scope, project_ctx=project_ctx),
            "conversations": scoped_chat_messages.list_conversations(
                username,
                scope,
                project_dir=(
                    project_ctx.output_dir if project_ctx is not None else None
                ),
                project_state_dir=(
                    project_ctx.state_dir if project_ctx is not None else None
                ),
            ),
            "decisions": chat_decisions.pending_for_scope(username, scope),
            "busy": chat_worker_lifecycle.is_busy(username),
            "commands": list_chat_slash_commands(
                username,
                include_project_tools=scope.kind == "project",
            ),
        },
    ):
        return None
    return scope


__all__ = ["send_scope_changed"]
