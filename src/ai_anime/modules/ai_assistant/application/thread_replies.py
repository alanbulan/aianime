"""Claude and Codex thread reply orchestration."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Literal

from ai_anime.modules.ai_assistant.application.chat_presentation import (
    ChatPresentation,
)
from ai_anime.modules.ai_assistant.application.page_agent_sessions import (
    PageAgentSessions,
)
from ai_anime.modules.ai_assistant.application.ports import (
    AgentThreadRuntime,
    ChatEventSink,
)
from ai_anime.modules.ai_assistant.application.project_media import ProjectMedia
from ai_anime.modules.ai_assistant.application.project_messages import (
    ProjectChatMessages,
)
from ai_anime.modules.ai_assistant.application.prompt_context import AgentPromptContext
from ai_anime.modules.ai_assistant.domain import (
    completion_text_or_existing,
    merge_stream_text,
    redact_local_filesystem_paths,
    split_trace_contents,
)

AgentThreadBackend = Literal["claude", "codex"]


class AgentThreadReplies:
    def __init__(
        self,
        thread_runtime: AgentThreadRuntime,
        prompt_context: AgentPromptContext,
        page_sessions: PageAgentSessions,
        project_media: ProjectMedia,
        project_messages: ProjectChatMessages,
        presentation: ChatPresentation,
    ) -> None:
        self._thread_runtime = thread_runtime
        self._prompt_context = prompt_context
        self._page_sessions = page_sessions
        self._project_media = project_media
        self._project_messages = project_messages
        self._presentation = presentation

    async def stream(
        self,
        backend: AgentThreadBackend,
        username: str,
        project: str,
        prompt: str,
        on_event: ChatEventSink,
        *,
        project_dir: str | Path | None = None,
        project_state_dir: str | Path | None = None,
    ) -> dict[str, Any]:
        agent_token = await self._page_sessions.create_token(
            username,
            project,
            agent_kind=backend,
        )
        if backend == "claude":
            thread = self._thread_runtime.open_claude(
                username,
                project,
                agent_token,
            )
        else:
            thread = self._thread_runtime.open_codex(
                username,
                project,
                agent_token,
            )

        agent_prompt = self._prompt_context.build(username, project, prompt)
        assistant_text = ""
        tool_text = ""
        async for event in thread.stream(agent_prompt):
            if event.type == "thread_started":
                thread_id = str(event.thread_id or "").strip() or None
                if thread_id:
                    self._thread_runtime.remember(username, backend, thread_id)
                await on_event(
                    {
                        "type": "thread_started",
                        "thread_id": thread_id,
                        "turn_id": str(event.turn_id or "").strip() or None,
                    }
                )
                continue
            if event.type == "assistant_delta":
                assistant_text = merge_stream_text(assistant_text, event.text)
                await on_event(
                    {
                        "type": "assistant_delta",
                        "text": redact_local_filesystem_paths(assistant_text),
                    }
                )
                continue
            if event.type == "tool_update":
                event_tool_text = str(event.text or "")
                if backend == "claude":
                    tool_text = event_tool_text
                else:
                    tool_text += event_tool_text
                await on_event({"type": "tool_update", "text": tool_text})
                continue
            if event.type == "complete":
                thread_id = str(event.thread_id or "").strip() or None
                if thread_id:
                    self._thread_runtime.remember(username, backend, thread_id)
                assistant_text = completion_text_or_existing(
                    event.text,
                    assistant_text,
                )

        assistant_text = assistant_text.strip() or "已执行，但没有返回正文。"
        assistant_text = self._presentation.normalize_reply(assistant_text)
        if tool_text.strip():
            self._project_messages.append_traces(
                username,
                project,
                split_trace_contents(tool_text),
                project_dir=project_dir,
                project_state_dir=project_state_dir,
            )
        media = self._project_media.extract(
            assistant_text,
            username,
            project,
            project_dir=project_dir,
        )
        result_message = self._project_messages.append_assistant(
            username,
            project,
            assistant_text,
            media,
            project_dir=project_dir,
            project_state_dir=project_state_dir,
        )
        await on_event({"type": "done", "message": result_message})
        return result_message


__all__ = ["AgentThreadBackend", "AgentThreadReplies"]
