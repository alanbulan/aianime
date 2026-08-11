"""Project chat turn orchestration."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from ai_anime.modules.ai_assistant.application.chat_events import (
    emit_chat_event_best_effort,
)
from ai_anime.modules.ai_assistant.application.ports import ChatEventSink
from ai_anime.modules.ai_assistant.application.project_assistant_replies import (
    ProjectAssistantReplies,
)
from ai_anime.modules.ai_assistant.application.project_messages import (
    ProjectChatMessages,
)
from ai_anime.modules.ai_assistant.domain import (
    ChatScope,
    message_content,
    should_emit_final_text,
    text_with_attachment_context,
    tool_display_payload,
)


class ProjectChatTurns:
    def __init__(
        self,
        replies: ProjectAssistantReplies,
        messages: ProjectChatMessages,
    ) -> None:
        self._replies = replies
        self._messages = messages

    async def stream(
        self,
        username: str,
        scope: ChatScope,
        text: str,
        attachments: list[dict[str, Any]],
        turn_id: str,
        on_event: ChatEventSink,
        *,
        project_dir: str | Path | None = None,
        project_state_dir: str | Path | None = None,
    ) -> dict[str, Any]:
        project = str(scope.id)
        agent_text = text_with_attachment_context(text, attachments)
        self._messages.append_user(
            username,
            project,
            text,
            turn_id=turn_id,
            project_dir=project_dir,
            project_state_dir=project_state_dir,
        )
        assistant_sent_text = ""
        done_sent = False

        async def on_reply_event(event: dict[str, Any]) -> None:
            nonlocal assistant_sent_text, done_sent
            event_type = event.get("type")
            if event_type == "thread_started":
                await emit_chat_event_best_effort(
                    on_event,
                    {
                        "type": "thread.started",
                        "scope": scope.to_dict(),
                        "thread_id": event.get("thread_id"),
                        "turn_id": event.get("turn_id") or turn_id,
                    },
                )
            elif event_type == "assistant_delta":
                assistant_sent_text = str(event.get("text") or "")
                await emit_chat_event_best_effort(
                    on_event,
                    {
                        "type": "assistant.delta",
                        "text": assistant_sent_text,
                        "turn_id": turn_id,
                        "accumulated": True,
                    },
                )
            elif event_type == "tool_update":
                tool_name, tool_body = tool_display_payload(
                    event.get("text"),
                    event.get("name"),
                )
                await emit_chat_event_best_effort(
                    on_event,
                    {
                        "type": "tool.result",
                        "turn_id": turn_id,
                        "name": tool_name,
                        "success": True,
                        "result": {"text": tool_body},
                        "error": None,
                    },
                )
            elif event_type == "assistant_message":
                message = event.get("message")
                if isinstance(message, dict):
                    assistant_sent_text = message_content(message)
                    await emit_chat_event_best_effort(
                        on_event,
                        {
                            "type": "assistant.message",
                            "turn_id": turn_id,
                            "message": message,
                        },
                    )
            elif event_type == "done":
                final_text = message_content(event.get("message"))
                if should_emit_final_text(final_text, assistant_sent_text):
                    assistant_sent_text = final_text
                    await emit_chat_event_best_effort(
                        on_event,
                        {
                            "type": "assistant.delta",
                            "text": final_text,
                            "turn_id": turn_id,
                            "accumulated": True,
                        },
                    )
                done_sent = await emit_chat_event_best_effort(
                    on_event,
                    {
                        "type": "chat.done",
                        "turn_id": turn_id,
                        "scope": scope.to_dict(),
                    },
                )

        try:
            return await self._replies.stream(
                username,
                project,
                agent_text,
                on_reply_event,
                turn_id=turn_id,
                project_dir=project_dir,
                project_state_dir=project_state_dir,
            )
        finally:
            if not done_sent:
                await emit_chat_event_best_effort(
                    on_event,
                    {
                        "type": "chat.done",
                        "turn_id": turn_id,
                        "scope": scope.to_dict(),
                    },
                )


__all__ = ["ProjectChatTurns"]
