"""Stable application API exposed by AI Assistant."""

from typing import Any

from ai_anime.modules.ai_assistant.application import (
    AgentBackend,
    AgentWorkspace,
    AgentThreadSessions,
    AgentToolConfiguration,
    ChatHistory,
    ChatRunLocks,
)
from ai_anime.modules.ai_assistant.domain import (
    ChatScope,
    completion_text_or_existing,
    dedupe_tool_ui_specs,
    filter_tool_ui_specs_for_prompt,
    is_hidden_chat_tool_event,
    merge_stream_text,
    message_content,
    reingest_confirmation_reply,
    redact_local_filesystem_paths,
    script_creation_guidance_prompt,
    should_emit_final_text,
    should_prewarm_scope,
    split_trace_contents,
    strip_replayed_chat_response,
    strip_stored_assistant_replay,
    strip_streamed_assistant_replay,
    text_with_attachment_context,
    tool_chat_error,
    tool_display_payload,
)


def append_tool_ui_specs(content: str, specs: list[dict[str, Any]]) -> str:
    from ai_anime.modules.ai_assistant.composition import get_chat_presentation

    return get_chat_presentation().append_tool_ui_specs(content, specs)


def extract_tool_ui_specs(value: Any) -> list[dict[str, Any]]:
    from ai_anime.modules.ai_assistant.composition import get_chat_presentation

    return get_chat_presentation().extract_tool_ui_specs(value)


def normalize_json_render_reply(content: str) -> str:
    from ai_anime.modules.ai_assistant.composition import get_chat_presentation

    return get_chat_presentation().normalize_reply(content)


def build_agent_prompt_context(username: str, project: str, prompt: str) -> str:
    from ai_anime.modules.ai_assistant.composition import get_agent_prompt_context

    return get_agent_prompt_context().build(username, project, prompt)


async def create_page_agent_session_token(
    username: str,
    project: str,
    *,
    agent_kind: str,
) -> str:
    from ai_anime.modules.ai_assistant.composition import get_page_agent_sessions

    return await get_page_agent_sessions().create_token(
        username,
        project,
        agent_kind=agent_kind,
    )


def get_agent_backend() -> AgentBackend:
    from ai_anime.modules.ai_assistant.composition import get_agent_backend as resolve

    return resolve()


def get_agent_tool_configuration() -> AgentToolConfiguration:
    from ai_anime.modules.ai_assistant.composition import (
        get_agent_tool_configuration as resolve,
    )

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
    "AgentToolConfiguration",
    "ChatHistory",
    "ChatRunLocks",
    "ChatScope",
    "append_tool_ui_specs",
    "build_agent_prompt_context",
    "completion_text_or_existing",
    "create_page_agent_session_token",
    "dedupe_tool_ui_specs",
    "extract_tool_ui_specs",
    "filter_tool_ui_specs_for_prompt",
    "get_agent_backend",
    "get_agent_tool_configuration",
    "get_agent_workspace",
    "get_agent_thread_sessions",
    "get_chat_history",
    "get_chat_run_locks",
    "is_hidden_chat_tool_event",
    "merge_stream_text",
    "message_content",
    "normalize_json_render_reply",
    "reingest_confirmation_reply",
    "redact_local_filesystem_paths",
    "script_creation_guidance_prompt",
    "should_emit_final_text",
    "should_prewarm_scope",
    "split_trace_contents",
    "strip_replayed_chat_response",
    "strip_stored_assistant_replay",
    "strip_streamed_assistant_replay",
    "text_with_attachment_context",
    "tool_chat_error",
    "tool_display_payload",
]
