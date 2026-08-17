"""Hermes project-chat reply orchestration."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from ai_anime.modules.ai_assistant.application.chat_events import (
    emit_chat_event_best_effort,
)
from ai_anime.modules.ai_assistant.application.chat_presentation import (
    ChatPresentation,
)
from ai_anime.modules.ai_assistant.application.display_fallback import DisplayFallbacks
from ai_anime.modules.ai_assistant.application.page_agent_sessions import (
    PageAgentSessions,
)
from ai_anime.modules.ai_assistant.application.ports import (
    ChatEventSink,
    HermesRuntime,
)
from ai_anime.modules.ai_assistant.application.project_media import ProjectMedia
from ai_anime.modules.ai_assistant.application.project_messages import (
    ProjectChatMessages,
)
from ai_anime.modules.ai_assistant.application.prompt_context import AgentPromptContext
from ai_anime.modules.ai_assistant.domain import (
    completion_text_or_existing,
    dedupe_tool_ui_specs,
    display_tool_call_key,
    extract_display_tool_call,
    filter_tool_ui_specs_for_prompt,
    infer_display_tool_call_from_text,
    is_hidden_chat_tool_event,
    merge_stream_text,
    redact_local_filesystem_paths,
    split_trace_contents,
    strip_replayed_chat_response,
    strip_streamed_assistant_replay,
    tool_chat_error,
)

logger = logging.getLogger(__name__)
HERMES_EMPTY_RESPONSE_MESSAGE = (
    "助手运行时没有返回有效内容。请重试当前指令；如果仍然出现此提示，"
    "请检查文本模型配置和本地运行日志。"
)


class HermesProjectReplies:
    def __init__(
        self,
        runtime: HermesRuntime,
        prompt_context: AgentPromptContext,
        project_messages: ProjectChatMessages,
        project_media: ProjectMedia,
        presentation: ChatPresentation,
        page_sessions: PageAgentSessions,
        display_fallbacks: DisplayFallbacks,
    ) -> None:
        self._runtime = runtime
        self._prompt_context = prompt_context
        self._project_messages = project_messages
        self._project_media = project_media
        self._presentation = presentation
        self._page_sessions = page_sessions
        self._display_fallbacks = display_fallbacks

    async def stream(
        self,
        username: str,
        project: str,
        prompt: str,
        on_event: ChatEventSink,
        *,
        turn_id: str | None = None,
        project_dir: str | Path | None = None,
        project_state_dir: str | Path | None = None,
        conversation_id: str = "main",
    ) -> dict[str, Any]:
        agent_prompt = self._prompt_context.build(username, project, prompt)
        thread = await self._runtime.get_for_user(
            username,
            scope_kind="project" if project else "home",
            project_id=project or None,
            conversation_id=conversation_id,
        )
        previous_assistant = (
            self._project_messages.assistant_contents(
                username,
                project,
                project_dir=project_dir,
                project_state_dir=project_state_dir,
                conversation_id=conversation_id,
            )
            if project
            else []
        )
        previous_trace = (
            self._project_messages.trace_contents(
                username,
                project,
                project_dir=project_dir,
                project_state_dir=project_state_dir,
                conversation_id=conversation_id,
            )
            if project
            else []
        )
        assistant_text = ""
        tool_text = ""
        tool_ui_specs: list[dict[str, Any]] = []
        fallback_tool_ui_specs: list[dict[str, Any]] = []
        fallback_token: str | None = None
        current_tool_name: str | None = None
        current_tool_hidden = False
        persisted_message: dict[str, Any] | None = None
        seen_display_calls: set[str] = set()
        seen_tool_chat_errors: set[str] = set()

        def persist_partial_reply() -> dict[str, Any] | None:
            nonlocal persisted_message
            if persisted_message is not None:
                return persisted_message
            final_text = strip_replayed_chat_response(
                assistant_text,
                previous_assistant,
                prompt,
            ).strip()
            all_tool_ui_specs = dedupe_tool_ui_specs(
                [*tool_ui_specs, *fallback_tool_ui_specs]
            )
            all_tool_ui_specs = filter_tool_ui_specs_for_prompt(
                prompt,
                all_tool_ui_specs,
            )
            final_text = self._presentation.append_tool_ui_specs(
                final_text,
                all_tool_ui_specs,
            )
            if not final_text:
                return None
            final_text = self._presentation.normalize_reply(final_text)
            final_tool_text = strip_streamed_assistant_replay(
                tool_text,
                previous_trace,
            )
            if final_tool_text.strip():
                self._project_messages.append_traces(
                    username,
                    project,
                    split_trace_contents(final_tool_text),
                    project_dir=project_dir,
                    project_state_dir=project_state_dir,
                    conversation_id=conversation_id,
                )
            media = self._project_media.extract(
                final_text,
                username,
                project,
                project_dir=project_dir,
            )
            persisted_message = self._project_messages.append_assistant(
                username,
                project,
                final_text,
                media,
                turn_id=turn_id,
                project_dir=project_dir,
                project_state_dir=project_state_dir,
                conversation_id=conversation_id,
            )
            return persisted_message

        try:
            async for event in thread.stream(
                agent_prompt,
                current_project=project or None,
            ):
                if event.type == "thread_started":
                    await emit_chat_event_best_effort(
                        on_event,
                        {
                            "type": "thread_started",
                            "thread_id": str(event.thread_id or "").strip() or None,
                            "turn_id": str(event.turn_id or "").strip() or None,
                        },
                    )
                    continue
                if event.type == "assistant_delta":
                    assistant_text = merge_stream_text(assistant_text, event.text)
                    streamed_text = strip_replayed_chat_response(
                        assistant_text,
                        previous_assistant,
                        prompt,
                        suppress_partial_replay=True,
                    )
                    await emit_chat_event_best_effort(
                        on_event,
                        {
                            "type": "assistant_delta",
                            "text": redact_local_filesystem_paths(streamed_text),
                        },
                    )
                    continue
                if event.type == "tool_update":
                    event_tool_name = event.name or current_tool_name
                    event_tool_hidden = is_hidden_chat_tool_event(
                        event_tool_name,
                        event.text,
                    )
                    tool_event_error = event.error
                    if event.raw is not None and not event_tool_hidden:
                        mapped_chat_error = tool_chat_error(
                            event.raw,
                            tool_name=event_tool_name,
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
                            await emit_chat_event_best_effort(
                                on_event,
                                {
                                    "type": "assistant_delta",
                                    "text": redact_local_filesystem_paths(
                                        mapped_chat_error
                                    ),
                                },
                            )
                        tool_ui_specs.extend(
                            self._presentation.extract_tool_ui_specs(event.raw)
                        )
                        display_call = extract_display_tool_call(event.raw)
                        if display_call is not None:
                            tool_name, tool_args = display_call
                            display_call_key = display_tool_call_key(
                                tool_name,
                                tool_args,
                            )
                            if display_call_key in seen_display_calls:
                                logger.info(
                                    "filtered duplicate hermes display fallback "
                                    "turn_id=%s project=%s tool=%s args=%s "
                                    "raw_kind=%s",
                                    event.turn_id,
                                    project,
                                    tool_name,
                                    json.dumps(
                                        tool_args,
                                        ensure_ascii=False,
                                        sort_keys=True,
                                        default=str,
                                    )[:1000],
                                    event.raw.get("sessionUpdate")
                                    if isinstance(event.raw, dict)
                                    else None,
                                )
                            else:
                                seen_display_calls.add(display_call_key)
                                if fallback_token is None:
                                    fallback_token = (
                                        await self._page_sessions.create_token(
                                            username,
                                            project,
                                            agent_kind="hermes-display-fallback",
                                        )
                                    )
                                fallback_tool_ui_specs.extend(
                                    await self._display_fallbacks.build(
                                        project,
                                        tool_name,
                                        tool_args,
                                        token=fallback_token,
                                    )
                                )
                    if event.name:
                        current_tool_name = event.name
                        current_tool_hidden = event_tool_hidden
                    if current_tool_hidden or event_tool_hidden:
                        continue
                    tool_text += str(event.text or "") + "\n"
                    display_tool_text = strip_streamed_assistant_replay(
                        tool_text,
                        previous_trace,
                    )
                    if display_tool_text.strip():
                        tool_call_id = getattr(event, "tool_call_id", None)
                        tool_phase = getattr(event, "tool_phase", None)
                        tool_input = getattr(event, "tool_input", None)
                        tool_output = getattr(event, "tool_output", None)
                        await emit_chat_event_best_effort(
                            on_event,
                            {
                                "type": "tool_update",
                                "text": display_tool_text,
                                "name": event_tool_name,
                                "tool_call_id": tool_call_id,
                                "tool_phase": tool_phase,
                                "input": tool_input,
                                "output": tool_output,
                                "success": (
                                    False
                                    if tool_event_error
                                    else event.success
                                ),
                                "error": tool_event_error,
                                "raw": event.raw,
                            },
                        )
                    continue
                if event.type == "complete":
                    if seen_tool_chat_errors and assistant_text.strip():
                        continue
                    assistant_text = completion_text_or_existing(
                        event.text,
                        assistant_text,
                    )

            if not assistant_text.strip():
                assistant_text = HERMES_EMPTY_RESPONSE_MESSAGE
            if not tool_ui_specs and not fallback_tool_ui_specs:
                inferred_display_call = infer_display_tool_call_from_text(
                    prompt,
                    assistant_text,
                    previous_assistant,
                )
                if inferred_display_call is not None:
                    tool_name, tool_args = inferred_display_call
                    if fallback_token is None:
                        fallback_token = await self._page_sessions.create_token(
                            username,
                            project,
                            agent_kind="hermes-display-fallback",
                        )
                    fallback_tool_ui_specs.extend(
                        await self._display_fallbacks.build(
                            project,
                            tool_name,
                            tool_args,
                            token=fallback_token,
                        )
                    )
            result_message = persist_partial_reply()
            if result_message is None:
                result_message = self._project_messages.append_assistant(
                    username,
                    project,
                    HERMES_EMPTY_RESPONSE_MESSAGE,
                    [],
                    turn_id=turn_id,
                    project_dir=project_dir,
                    project_state_dir=project_state_dir,
                    conversation_id=conversation_id,
                )
                persisted_message = result_message
            await emit_chat_event_best_effort(
                on_event,
                {"type": "assistant_message", "message": result_message},
            )
            await emit_chat_event_best_effort(
                on_event,
                {"type": "done", "message": result_message},
            )
            return result_message
        finally:
            persist_partial_reply()


__all__ = ["HermesProjectReplies"]
