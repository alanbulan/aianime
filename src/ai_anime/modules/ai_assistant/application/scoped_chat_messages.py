"""Scope-aware chat message operations."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from ai_anime.modules.ai_assistant.application.ports import ChatHistory
from ai_anime.modules.ai_assistant.application.project_messages import (
    ProjectChatMessages,
)
from ai_anime.modules.ai_assistant.domain import ChatScope


class ScopedChatMessages:
    def __init__(
        self,
        history: ChatHistory,
        project_messages: ProjectChatMessages,
    ) -> None:
        self._history = history
        self._project_messages = project_messages

    def append_notification(
        self,
        username: str,
        scope: ChatScope,
        content: str,
        *,
        project_dir: str | Path | None = None,
        project_state_dir: str | Path | None = None,
    ) -> dict[str, Any]:
        if scope.kind == "project":
            return self._project_messages.append_assistant(
                username,
                str(scope.id),
                content,
                project_dir=project_dir,
                project_state_dir=project_state_dir,
                conversation_id=scope.conversation_id,
            )
        return self._history.append_message(
            username,
            scope,
            "assistant",
            content,
        )

    def append_ui_event(
        self,
        username: str,
        scope: ChatScope,
        turn_id: str,
        event: dict[str, Any],
        *,
        project_dir: str | Path | None = None,
        project_state_dir: str | Path | None = None,
    ) -> dict[str, Any]:
        project_kwargs = {
            key: value
            for key, value in {
                "project_dir": project_dir,
                "project_state_dir": project_state_dir,
            }.items()
            if value is not None
        }
        return self._history.append_ui_event(
            username,
            scope,
            turn_id,
            event,
            **project_kwargs,
        )

    def list(
        self,
        username: str,
        scope: ChatScope,
        *,
        project_dir: str | Path | None = None,
        project_state_dir: str | Path | None = None,
    ) -> list[dict[str, Any]]:
        if scope.kind == "project":
            return self._project_messages.list(
                username,
                str(scope.id),
                project_dir=project_dir,
                project_state_dir=project_state_dir,
                conversation_id=scope.conversation_id,
            )
        return self._history.list_messages(username, scope)

    def list_conversations(
        self,
        username: str,
        scope: ChatScope,
        *,
        project_dir: str | Path | None = None,
        project_state_dir: str | Path | None = None,
    ) -> list[dict[str, Any]]:
        return self._history.list_conversations(
            username,
            scope,
            project_dir=project_dir,
            project_state_dir=project_state_dir,
        )

    def delete_conversation(
        self,
        username: str,
        scope: ChatScope,
        *,
        project_dir: str | Path | None = None,
        project_state_dir: str | Path | None = None,
    ) -> bool:
        return self._history.delete_conversation(
            username,
            scope,
            project_dir=project_dir,
            project_state_dir=project_state_dir,
        )


__all__ = ["ScopedChatMessages"]
