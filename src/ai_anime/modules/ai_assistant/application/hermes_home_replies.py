"""Hermes home-chat reply orchestration."""

from __future__ import annotations

from typing import Any

from ai_anime.modules.ai_assistant.application.chat_events import (
    emit_chat_event,
    emit_chat_event_best_effort,
)
from ai_anime.modules.ai_assistant.application.hermes_session_models import (
    HermesSessionModels,
)
from ai_anime.modules.ai_assistant.application.ports import (
    ChatEventSink,
    ChatHistory,
    HermesRuntime,
)
from ai_anime.modules.ai_assistant.domain import (
    ChatScope,
    completion_text_or_existing,
    is_slash_command,
    merge_stream_text,
    message_content,
    should_emit_final_text,
    strip_replayed_chat_response,
    prepend_managed_context,
    text_with_attachment_context,
    tool_chat_error,
    tool_display_payload,
)
from ai_anime.modules.project_workspace.public import list_project_workspaces


class HermesHomeReplies:
    def __init__(
        self,
        runtime: HermesRuntime,
        history: ChatHistory,
        session_models: HermesSessionModels,
    ) -> None:
        self._runtime = runtime
        self._history = history
        self._session_models = session_models

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
        context_policy = self._history.load_context_policy(username, scope)
        previous_assistant = next(
            (
                str(message.get("content") or "")
                for message in reversed(list(context_policy.get("messages") or []))
                if message.get("role") == "assistant"
            ),
            "",
        )
        slash_command = not attachments and is_slash_command(text)
        rebuild_context = bool(context_policy.get("rebuild_required"))
        context_revision = int(context_policy.get("revision") or 0)
        if rebuild_context:
            await self._runtime.forget_conversation(
                username,
                scope_kind="home",
                project_id=None,
                conversation_id=scope.conversation_id,
            )
        base_agent_text = text_with_attachment_context(text, attachments)
        agent_text = (
            base_agent_text
            if slash_command
            else prepend_managed_context(
                base_agent_text,
                list(context_policy.get("messages") or []),
                rebuild_context=rebuild_context,
            )
        )
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
            conversation_id=scope.conversation_id,
        )
        await self._session_models.apply_to(thread, username, scope)

        assistant_text = ""
        tool_text = ""
        tool_name = ""
        persisted = False
        done_sent = False
        seen_tool_chat_errors: set[str] = set()
        context_rebuild_marked = False

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

        await emit_chat_event(
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
                    if rebuild_context and not slash_command and not context_rebuild_marked:
                        self._history.mark_context_rebuilt(
                            username,
                            scope,
                            context_revision,
                        )
                        context_rebuild_marked = True
                    await emit_chat_event(
                        on_event,
                        {
                            "type": "thread.started",
                            "scope": scope.to_dict(),
                            "thread_id": str(event.thread_id or "").strip() or None,
                            "turn_id": str(event.turn_id or "").strip() or turn_id,
                        },
                    )
                elif event.type == "available_commands":
                    await emit_chat_event(
                        on_event,
                        {
                            "type": "commands.available",
                            "commands": event.raw,
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
                    await emit_chat_event(
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
                    tool_event_error = event.error
                    if event.raw is not None:
                        mapped_chat_error = tool_chat_error(
                            event.raw,
                            tool_name=tool_name,
                        )
                        if mapped_chat_error:
                            tool_event_error = mapped_chat_error
                        if (
                            mapped_chat_error
                            and mapped_chat_error not in seen_tool_chat_errors
                        ):
                            seen_tool_chat_errors.add(mapped_chat_error)
                            assistant_text = merge_stream_text(
                                assistant_text,
                                ("\n\n" if assistant_text.strip() else "")
                                + mapped_chat_error,
                            )
                            await emit_chat_event(
                                on_event,
                                {
                                    "type": "assistant.delta",
                                    "text": mapped_chat_error,
                                    "turn_id": turn_id,
                                    "accumulated": True,
                                },
                            )
                    tool_text += str(event.text or "") + "\n"
                    display_name, display_body = tool_display_payload(
                        tool_text,
                        tool_name,
                    )
                    tool_call_id = getattr(event, "tool_call_id", None)
                    tool_phase = getattr(event, "tool_phase", None)
                    tool_input = getattr(event, "tool_input", None)
                    tool_output = getattr(event, "tool_output", None)
                    if tool_phase == "call":
                        await emit_chat_event(
                            on_event,
                            {
                                "type": "tool.call",
                                "turn_id": turn_id,
                                "tool_call_id": tool_call_id,
                                "name": display_name,
                                "input": tool_input,
                                "raw": event.raw,
                            },
                        )
                        continue
                    await emit_chat_event(
                        on_event,
                        {
                            "type": "tool.result",
                            "turn_id": turn_id,
                            "tool_call_id": tool_call_id,
                            "name": display_name,
                            "success": False if tool_event_error else event.success is not False,
                            "result": (
                                tool_output
                                if tool_output is not None
                                else {"text": display_body}
                            ),
                            "error": tool_event_error,
                            "raw": event.raw,
                        },
                    )
                elif event.type == "complete":
                    if seen_tool_chat_errors and assistant_text.strip():
                        continue
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
