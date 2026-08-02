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
from ai_anime.modules.ai_assistant.domain.chat_presentation import (
    dedupe_tool_ui_specs,
    filter_tool_ui_specs_for_prompt,
    redact_local_filesystem_paths,
)
from ai_anime.modules.ai_assistant.domain.display_tools import (
    display_tool_call_key,
    extract_display_tool_call,
    infer_display_tool_call_from_text,
    is_display_tool_name,
)
from ai_anime.modules.ai_assistant.domain.display_fallback import (
    character_identity_requests,
    display_candidate_beat,
    display_episode,
    project_beat_image_specs,
    project_character_media_specs,
    project_episode_media_specs,
    project_scene_image_specs,
    project_sketch_candidate_specs,
)
from ai_anime.modules.ai_assistant.domain.project_media import (
    canonical_media_path,
    content_media_urls,
    content_relative_media_paths,
    filter_markdown_duplicate_media,
    is_markdown_image_ref,
    markdown_image_refs,
    media_kind,
    media_path_from_static_url,
    merge_project_media_items,
    normalize_media_source,
)
from ai_anime.modules.ai_assistant.domain.scope import ChatScope
from ai_anime.modules.ai_assistant.domain.prompt_context import compose_agent_prompt
from ai_anime.modules.ai_assistant.domain.turn_guidance import (
    reingest_confirmation_reply,
    script_creation_guidance_prompt,
)
from ai_anime.modules.ai_assistant.domain.tool_errors import tool_chat_error

__all__ = [
    "ChatScope",
    "canonical_media_path",
    "completion_text_or_existing",
    "compose_agent_prompt",
    "character_identity_requests",
    "content_media_urls",
    "content_relative_media_paths",
    "dedupe_tool_ui_specs",
    "display_tool_call_key",
    "display_candidate_beat",
    "display_episode",
    "extract_display_tool_call",
    "filter_markdown_duplicate_media",
    "filter_tool_ui_specs_for_prompt",
    "infer_display_tool_call_from_text",
    "is_hidden_chat_tool_event",
    "is_display_tool_name",
    "is_markdown_image_ref",
    "markdown_image_refs",
    "media_kind",
    "media_path_from_static_url",
    "merge_project_media_items",
    "merge_stream_text",
    "message_content",
    "normalize_media_source",
    "project_beat_image_specs",
    "project_character_media_specs",
    "project_episode_media_specs",
    "project_scene_image_specs",
    "project_sketch_candidate_specs",
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
    "tool_display_payload",
    "tool_chat_error",
]
