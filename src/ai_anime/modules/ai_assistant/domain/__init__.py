"""AI Assistant domain rules."""

from ai_anime.modules.ai_assistant.domain.chat_text import (
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
from ai_anime.modules.ai_assistant.domain.scope import ChatScope

__all__ = [
    "ChatScope",
    "completion_text_or_existing",
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
