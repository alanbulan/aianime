"""Stable application API exposed by AI Assistant."""

from ai_anime.modules.ai_assistant.application import (
    AgentBackend,
    AgentWorkspace,
    AgentThreadSessions,
    ChatHistory,
    ChatRunLocks,
)
from ai_anime.modules.ai_assistant.domain import (
    ChatScope,
    completion_text_or_existing,
    is_hidden_chat_tool_event,
    merge_stream_text,
    message_content,
    reingest_confirmation_reply,
    script_creation_guidance_prompt,
    should_emit_final_text,
    should_prewarm_scope,
    split_trace_contents,
    strip_replayed_chat_response,
    strip_stored_assistant_replay,
    strip_streamed_assistant_replay,
    text_with_attachment_context,
    tool_display_payload,
)


def build_agent_prompt_context(username: str, project: str, prompt: str) -> str:
    from ai_anime.modules.ai_assistant.composition import get_agent_prompt_context

    return get_agent_prompt_context().build(username, project, prompt)


def get_agent_backend() -> AgentBackend:
    from ai_anime.modules.ai_assistant.composition import get_agent_backend as resolve

    return resolve()


def get_agent_workspace() -> AgentWorkspace:
    from ai_anime.modules.ai_assistant.composition import get_agent_workspace as resolve

    return resolve()


def get_agent_thread_sessions() -> AgentThreadSessions:
    from ai_anime.modules.ai_assistant.composition import (
        get_agent_thread_sessions as resolve,
    )

    return resolve()


def get_chat_history() -> ChatHistory:
    from ai_anime.modules.ai_assistant.composition import get_chat_history as resolve

    return resolve()


def get_chat_run_locks() -> ChatRunLocks:
    from ai_anime.modules.ai_assistant.composition import get_chat_run_locks as resolve

    return resolve()


__all__ = [
    "AgentBackend",
    "AgentWorkspace",
    "AgentThreadSessions",
    "ChatHistory",
    "ChatRunLocks",
    "ChatScope",
    "build_agent_prompt_context",
    "completion_text_or_existing",
    "get_agent_backend",
    "get_agent_workspace",
    "get_agent_thread_sessions",
    "get_chat_history",
    "get_chat_run_locks",
    "is_hidden_chat_tool_event",
    "merge_stream_text",
    "message_content",
    "reingest_confirmation_reply",
    "script_creation_guidance_prompt",
    "should_emit_final_text",
    "should_prewarm_scope",
    "split_trace_contents",
    "strip_replayed_chat_response",
    "strip_stored_assistant_replay",
    "strip_streamed_assistant_replay",
    "text_with_attachment_context",
    "tool_display_payload",
]
