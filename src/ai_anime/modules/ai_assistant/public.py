"""Stable application API exposed by AI Assistant."""

from pathlib import Path
from typing import Any

from ai_anime.modules.ai_assistant.application import (
    AgentBackend,
    AgentThreadReplies,
    AgentThreadRuntime,
    ChatHistory,
    ChatRunLocks,
    ProjectChatMessages,
)
from ai_anime.modules.ai_assistant.domain import (
    ChatScope,
    completion_text_or_existing,
    dedupe_tool_ui_specs,
    display_tool_call_key,
    extract_display_tool_call,
    filter_tool_ui_specs_for_prompt,
    infer_display_tool_call_from_text,
    is_display_tool_name,
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


async def fallback_display_tool_ui_specs(
    project: str,
    tool_name: str,
    args: dict[str, Any],
    *,
    token: str,
) -> list[dict[str, Any]]:
    from ai_anime.modules.ai_assistant.composition import get_display_fallbacks

    return await get_display_fallbacks().build(
        project,
        tool_name,
        args,
        token=token,
    )


def extract_project_media(
    content: str,
    username: str,
    project: str,
    *,
    project_dir: str | Path | None = None,
) -> list[dict[str, str]]:
    from ai_anime.modules.ai_assistant.composition import get_project_media

    return get_project_media().extract(
        content,
        username,
        project,
        project_dir=project_dir,
    )


def get_agent_backend() -> AgentBackend:
    from ai_anime.modules.ai_assistant.composition import get_agent_backend as resolve

    return resolve()


def get_agent_thread_runtime() -> AgentThreadRuntime:
    from ai_anime.modules.ai_assistant.composition import (
        get_agent_thread_runtime as resolve,
    )

    return resolve()


def get_agent_thread_replies() -> AgentThreadReplies:
    from ai_anime.modules.ai_assistant.composition import (
        get_agent_thread_replies as resolve,
    )

    return resolve()


def get_chat_history() -> ChatHistory:
    from ai_anime.modules.ai_assistant.composition import get_chat_history as resolve

    return resolve()


def get_chat_run_locks() -> ChatRunLocks:
    from ai_anime.modules.ai_assistant.composition import get_chat_run_locks as resolve

    return resolve()


def get_project_chat_messages() -> ProjectChatMessages:
    from ai_anime.modules.ai_assistant.composition import (
        get_project_chat_messages as resolve,
    )

    return resolve()


__all__ = [
    "AgentBackend",
    "AgentThreadReplies",
    "AgentThreadRuntime",
    "ChatHistory",
    "ChatRunLocks",
    "ProjectChatMessages",
    "ChatScope",
    "append_tool_ui_specs",
    "build_agent_prompt_context",
    "completion_text_or_existing",
    "create_page_agent_session_token",
    "dedupe_tool_ui_specs",
    "display_tool_call_key",
    "extract_tool_ui_specs",
    "extract_display_tool_call",
    "extract_project_media",
    "fallback_display_tool_ui_specs",
    "filter_tool_ui_specs_for_prompt",
    "get_agent_backend",
    "get_agent_thread_replies",
    "get_agent_thread_runtime",
    "get_chat_history",
    "get_chat_run_locks",
    "get_project_chat_messages",
    "is_hidden_chat_tool_event",
    "infer_display_tool_call_from_text",
    "is_display_tool_name",
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
