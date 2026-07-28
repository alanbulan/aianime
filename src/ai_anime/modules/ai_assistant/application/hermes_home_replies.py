"""Hermes home-chat reply orchestration."""

from __future__ import annotations

from typing import Any

from ai_anime.modules.ai_assistant.application.chat_events import (
    emit_chat_event_best_effort,
)
from ai_anime.modules.ai_assistant.application.ports import (
    ChatEventSink,
    ChatHistory,
    HermesRuntime,
)
from ai_anime.modules.ai_assistant.domain import (
    ChatScope,
    completion_text_or_existing,
    merge_stream_text,
    message_content,
    should_emit_final_text,
    strip_replayed_chat_response,
    text_with_attachment_context,
    tool_display_payload,
)
from ai_anime.modules.project_workspace.public import list_project_workspaces


class HermesHomeReplies:
    def __init__(self, runtime: HermesRuntime, history: ChatHistory) -> None:
        self._runtime = runtime
        self._history = history

    async def stream(
        self,
        username: str,
        scope: ChatScope,
        text: str,
        attachments: list[dict[str, Any]],
        turn_id: str,
        on_event: ChatEventSink,
    ) -> None:
        before_projects = {
            project.name
            for project in await list_project_workspaces({"username": username})
        }
        previous_assistant = next(
            (
                str(message.get("content") or "")
                for message in reversed(self._history.list_messages(username, scope))
                if message.get("role") == "assistant"
            ),
            "",
        )
        agent_text = text_with_attachment_context(text, attachments)
        self._history.append_message(
            username,
            scope,
            "user",
            text,
            media=attachments,
            turn_id=turn_id,
        )
        thread = await self._runtime.get_for_user(
            username,
            scope_kind="home",
            project_id=None,
        )

        assistant_text = ""
        tool_text = ""
        tool_name = ""
        persisted = False
        done_sent = False

        def persist_partial_reply() -> None:
            nonlocal persisted
            if persisted:
                return
            final_text = strip_replayed_chat_response(
                assistant_text,
                previous_assistant,
                text,
            ).strip()
            if not final_text:
                return
            self._history.append_message(
                username,
                scope,
                "assistant",
                final_text,
            )
            persisted = True

        await emit_chat_event_best_effort(
            on_event,
            {
                "type": "thread.started",
                "scope": scope.to_dict(),
                "thread_id": getattr(thread, "id", None) or None,
                "turn_id": turn_id,
            },
        )
        try:
            async for event in thread.stream(agent_text, current_project=None):
                if event.type == "thread_started":
                    await emit_chat_event_best_effort(
                        on_event,
                        {
                            "type": "thread.started",
                            "scope": scope.to_dict(),
                            "thread_id": str(event.thread_id or "").strip() or None,
                            "turn_id": str(event.turn_id or "").strip() or turn_id,
                        },
                    )
                elif event.type == "assistant_delta":
                    assistant_text = merge_stream_text(assistant_text, event.text)
                    display_text = strip_replayed_chat_response(
                        assistant_text,
                        previous_assistant,
                        text,
                        suppress_partial_replay=True,
                    )
                    await emit_chat_event_best_effort(
                        on_event,
                        {
                            "type": "assistant.delta",
                            "text": display_text,
                            "turn_id": turn_id,
                            "accumulated": True,
                        },
                    )
                elif event.type == "tool_update":
                    if event.name:
                        tool_name = event.name
                    tool_text += str(event.text or "") + "\n"
                    display_name, display_body = tool_display_payload(
                        tool_text,
                        tool_name,
                    )
                    await emit_chat_event_best_effort(
                        on_event,
                        {
                            "type": "tool.result",
                            "turn_id": turn_id,
                            "name": display_name,
                            "success": True,
                            "result": {"text": display_body},
                            "error": None,
                        },
                    )
                elif event.type == "complete":
                    assistant_text = completion_text_or_existing(
                        event.text,
                        assistant_text,
                    )

            assistant_text = strip_replayed_chat_response(
                assistant_text,
                previous_assistant,
                text,
            )
            assistant_text = assistant_text.strip() or "(agent returned no content)"
            message = self._history.append_message(
                username,
                scope,
                "assistant",
                assistant_text,
            )
            persisted = True
            await emit_chat_event_best_effort(
                on_event,
                {
                    "type": "assistant.message",
                    "turn_id": turn_id,
                    "message": message,
                },
            )
            assistant_sent_text = message_content(message)
            if should_emit_final_text(assistant_text, assistant_sent_text):
                await emit_chat_event_best_effort(
                    on_event,
                    {
                        "type": "assistant.delta",
                        "text": assistant_text,
                        "turn_id": turn_id,
                        "accumulated": True,
                    },
                )

            after_projects = {
                project.name
                for project in await list_project_workspaces({"username": username})
            }
            for project in sorted(after_projects - before_projects):
                project_scope = ChatScope(kind="project", id=project)
                self._history.append_message(
                    username,
                    project_scope,
                    "system",
                    f"Created from home conversation turn {turn_id}.",
                )
                await emit_chat_event_best_effort(
                    on_event,
                    {"type": "project.created", "project": project},
                )

            done_sent = await emit_chat_event_best_effort(
                on_event,
                {"type": "chat.done", "turn_id": turn_id, "scope": scope.to_dict()},
            )
        finally:
            persist_partial_reply()
            if not done_sent:
                await emit_chat_event_best_effort(
                    on_event,
                    {
                        "type": "chat.done",
                        "turn_id": turn_id,
                        "scope": scope.to_dict(),
                    },
                )


__all__ = ["HermesHomeReplies"]
