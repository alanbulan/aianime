"""Stable application API exposed by AI Assistant."""

from pathlib import Path
from typing import Any

from ai_anime.modules.ai_assistant.application import (
    ChatWorkerLifecycle,
    HermesHomeReplies,
    HermesRuntimePrewarmer,
    ProjectChatTurns,
    ScopedChatMessages,
    SpeechTranscript,
    SpeechTranscription,
    SpeechTranscriptionFailed,
    SpeechTranscriptionUnavailable,
)
from ai_anime.modules.ai_assistant.domain import (
    ChatScope,
    InteractiveChatScopeKind,
    dedupe_tool_ui_specs,
    display_tool_call_key,
    extract_display_tool_call,
    filter_tool_ui_specs_for_prompt,
    infer_display_tool_call_from_text,
    is_display_tool_name,
    redact_local_filesystem_paths,
    should_prewarm_scope,
    tool_chat_error,
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


def get_hermes_runtime_prewarmer() -> HermesRuntimePrewarmer:
    from ai_anime.modules.ai_assistant.composition import (
        get_hermes_runtime_prewarmer as resolve,
    )

    return resolve()


def get_chat_worker_lifecycle() -> ChatWorkerLifecycle:
    from ai_anime.modules.ai_assistant.composition import (
        get_chat_worker_lifecycle as resolve,
    )

    return resolve()


def get_hermes_home_replies() -> HermesHomeReplies:
    from ai_anime.modules.ai_assistant.composition import (
        get_hermes_home_replies as resolve,
    )

    return resolve()


def get_project_chat_turns() -> ProjectChatTurns:
    from ai_anime.modules.ai_assistant.composition import (
        get_project_chat_turns as resolve,
    )

    return resolve()


def get_scoped_chat_messages() -> ScopedChatMessages:
    from ai_anime.modules.ai_assistant.composition import (
        get_scoped_chat_messages as resolve,
    )

    return resolve()


def get_speech_transcription() -> SpeechTranscription:
    from ai_anime.modules.ai_assistant.composition import (
        get_speech_transcription as resolve,
    )

    return resolve()


__all__ = [
    "ChatWorkerLifecycle",
    "HermesHomeReplies",
    "HermesRuntimePrewarmer",
    "ProjectChatTurns",
    "ScopedChatMessages",
    "SpeechTranscript",
    "SpeechTranscription",
    "SpeechTranscriptionFailed",
    "SpeechTranscriptionUnavailable",
    "ChatScope",
    "InteractiveChatScopeKind",
    "append_tool_ui_specs",
    "build_agent_prompt_context",
    "create_page_agent_session_token",
    "dedupe_tool_ui_specs",
    "display_tool_call_key",
    "extract_tool_ui_specs",
    "extract_display_tool_call",
    "extract_project_media",
    "fallback_display_tool_ui_specs",
    "filter_tool_ui_specs_for_prompt",
    "get_hermes_runtime_prewarmer",
    "get_chat_worker_lifecycle",
    "get_hermes_home_replies",
    "get_project_chat_turns",
    "get_scoped_chat_messages",
    "get_speech_transcription",
    "infer_display_tool_call_from_text",
    "is_display_tool_name",
    "normalize_json_render_reply",
    "redact_local_filesystem_paths",
    "should_prewarm_scope",
    "tool_chat_error",
]
