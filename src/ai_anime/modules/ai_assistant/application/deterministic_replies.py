"""Deterministic project-chat reply orchestration."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from ai_anime.modules.ai_assistant.application.chat_events import (
    emit_chat_event_best_effort,
)
from ai_anime.modules.ai_assistant.application.ports import ChatEventSink
from ai_anime.modules.ai_assistant.application.project_messages import (
    ProjectChatMessages,
)
from ai_anime.modules.ai_assistant.domain import redact_local_filesystem_paths


class DeterministicProjectReplies:
    def __init__(self, project_messages: ProjectChatMessages) -> None:
        self._project_messages = project_messages

    async def stream(
        self,
        username: str,
        project: str,
        content: str,
        on_event: ChatEventSink,
        *,
        project_dir: str | Path | None = None,
        project_state_dir: str | Path | None = None,
    ) -> dict[str, Any]:
        content = redact_local_filesystem_paths(content)
        message = self._project_messages.append_assistant(
            username,
            project,
            content,
            [],
            project_dir=project_dir,
            project_state_dir=project_state_dir,
        )
        await emit_chat_event_best_effort(
            on_event,
            {"type": "assistant_delta", "text": content},
        )
        await emit_chat_event_best_effort(
            on_event,
            {"type": "done", "message": message},
        )
        return message


__all__ = ["DeterministicProjectReplies"]
