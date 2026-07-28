"""Stable application API exposed by AI Assistant."""

from ai_anime.modules.ai_assistant.application import ChatHistory
from ai_anime.modules.ai_assistant.domain import (
    ChatScope,
    completion_text_or_existing,
    is_hidden_chat_tool_event,
    merge_stream_text,
    message_content,
    should_emit_final_text,
    should_prewarm_scope,
    split_trace_contents,
    strip_replayed_chat_response,
    strip_stored_assistant_replay,
    strip_streamed_assistant_replay,
    text_with_attachment_context,
    tool_display_payload,
)


def get_chat_history() -> ChatHistory:
    from ai_anime.modules.ai_assistant.composition import get_chat_history as resolve

    return resolve()


__all__ = [
    "ChatHistory",
    "ChatScope",
    "completion_text_or_existing",
    "get_chat_history",
    "is_hidden_chat_tool_event",
    "merge_stream_text",
    "message_content",
    "should_emit_final_text",
    "should_prewarm_scope",
    "split_trace_contents",
    "strip_replayed_chat_response",
    "strip_stored_assistant_replay",
    "strip_streamed_assistant_replay",
    "text_with_attachment_context",
    "tool_display_payload",
]
