"""Project-scoped chat message use cases."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from ai_anime.modules.ai_assistant.application.ports import ChatHistory
from ai_anime.modules.ai_assistant.application.project_media import ProjectMedia
from ai_anime.modules.ai_assistant.domain import (
    ChatScope,
    filter_markdown_duplicate_media,
    merge_project_media_items,
    redact_local_filesystem_paths,
    strip_streamed_assistant_replay,
)


_HISTORY_ATTACHMENT_FIELDS = (
    "id",
    "type",
    "kind",
    "mimeType",
    "fileName",
    "fileSize",
    "url",
    "path",
    "label",
)


def _history_attachments(media: object) -> list[dict[str, Any]]:
    if not isinstance(media, list):
        return []
    return [
        {
            key: item[key]
            for key in _HISTORY_ATTACHMENT_FIELDS
            if key in item and item[key] is not None
        }
        for item in media
        if isinstance(item, dict)
    ]


class ProjectChatMessages:
    def __init__(self, history: ChatHistory, media: ProjectMedia) -> None:
        self._history = history
        self._media = media

    def list(
        self,
        username: str,
        project: str,
        *,
        project_dir: str | Path | None = None,
        project_state_dir: str | Path | None = None,
        limit: int = 50,
        conversation_id: str = "main",
    ) -> list[dict[str, Any]]:
        stored_messages = self._history.list_project_messages(
            username,
            project,
            project_dir=project_dir,
            project_state_dir=project_state_dir,
            limit=limit,
            conversation_id=conversation_id,
        )
        messages: list[dict[str, Any]] = []
        previous_assistants: list[str] = []
        for message in stored_messages:
            content = str(message["content"])
            role = str(message["role"])
            if role == "assistant":
                raw_content = content
                content = strip_streamed_assistant_replay(
                    content,
                    previous_assistants,
                )
                previous_assistants.append(raw_content)
            stored_media = self._media.normalize(
                message.get("media") or [],
                username,
                project,
                project_dir=project_dir,
            )
            extracted_media = self._media.extract(
                content,
                username,
                project,
                project_dir=project_dir,
            )
            merged_media = merge_project_media_items(stored_media, extracted_media)
            messages.append(
                {
                    "id": int(message["id"]),
                    "role": role,
                    "content": content,
                    **(
                        {"turn_id": str(message["turn_id"])}
                        if message.get("turn_id")
                        else {}
                    ),
                    "media": filter_markdown_duplicate_media(
                        content,
                        merged_media,
                    ),
                    "attachments": _history_attachments(message.get("media")),
                    **(
                        {"ui_events": message["ui_events"]}
                        if isinstance(message.get("ui_events"), list)
                        else {}
                    ),
                    "created_at": str(message["created_at"]),
                }
            )
        return messages

    def assistant_contents(
        self,
        username: str,
        project: str,
        *,
        project_dir: str | Path | None = None,
        project_state_dir: str | Path | None = None,
        conversation_id: str = "main",
    ) -> list[str]:
        return [
            str(message.get("content") or "")
            for message in self.list(
                username,
                project,
                project_dir=project_dir,
                project_state_dir=project_state_dir,
                conversation_id=conversation_id,
            )
            if message.get("role") == "assistant"
        ]

    def trace_contents(
        self,
        username: str,
        project: str,
        *,
        project_dir: str | Path | None = None,
        project_state_dir: str | Path | None = None,
        conversation_id: str = "main",
    ) -> list[str]:
        return self._history.list_project_trace_contents(
            username,
            project,
            project_dir=project_dir,
            project_state_dir=project_state_dir,
            conversation_id=conversation_id,
        )

    def replace_traces(
        self,
        username: str,
        project: str,
        messages: list[dict[str, Any]],
        *,
        project_dir: str | Path | None = None,
        project_state_dir: str | Path | None = None,
        conversation_id: str = "main",
    ) -> None:
        self._history.replace_project_trace_messages(
            username,
            project,
            messages,
            project_dir=project_dir,
            project_state_dir=project_state_dir,
            conversation_id=conversation_id,
        )

    def append_user(
        self,
        username: str,
        project: str,
        content: str,
        media: list[dict[str, Any]] | None = None,
        *,
        turn_id: str | None = None,
        project_dir: str | Path | None = None,
        project_state_dir: str | Path | None = None,
        conversation_id: str = "main",
    ) -> dict[str, Any]:
        return self._history.append_project_message(
            username,
            project,
            "user",
            content,
            media,
            turn_id=turn_id,
            project_dir=project_dir,
            project_state_dir=project_state_dir,
            conversation_id=conversation_id,
        )

    def prepare_user_attachments(
        self,
        username: str,
        project: str,
        attachments: list[dict[str, Any]],
        *,
        project_dir: str | Path | None = None,
    ) -> list[dict[str, Any]]:
        return self._media.prepare_chat_attachments(
            attachments,
            username,
            project,
            project_dir=project_dir,
        )

    def append_assistant(
        self,
        username: str,
        project: str,
        content: str,
        media: list[dict[str, Any]] | None = None,
        *,
        turn_id: str | None = None,
        project_dir: str | Path | None = None,
        project_state_dir: str | Path | None = None,
        conversation_id: str = "main",
    ) -> dict[str, Any]:
        return self._history.append_project_message(
            username,
            project,
            "assistant",
            redact_local_filesystem_paths(content),
            media,
            turn_id=turn_id,
            project_dir=project_dir,
            project_state_dir=project_state_dir,
            conversation_id=conversation_id,
        )

    def append_traces(
        self,
        username: str,
        project: str,
        contents: list[str],
        *,
        project_dir: str | Path | None = None,
        project_state_dir: str | Path | None = None,
        conversation_id: str = "main",
    ) -> list[dict[str, Any]]:
        return self._history.append_project_trace_messages(
            username,
            project,
            contents,
            project_dir=project_dir,
            project_state_dir=project_state_dir,
            conversation_id=conversation_id,
        )

    def append_ui_event(
        self,
        username: str,
        project: str,
        turn_id: str,
        event: dict[str, Any],
        *,
        project_dir: str | Path | None = None,
        project_state_dir: str | Path | None = None,
        conversation_id: str = "main",
    ) -> dict[str, Any]:
        return self._history.append_ui_event(
            username,
            ChatScope(
                kind="project",
                id=project,
                conversation_id=conversation_id,
            ),
            turn_id,
            event,
            project_dir=project_dir,
            project_state_dir=project_state_dir,
        )


__all__ = ["ProjectChatMessages"]
