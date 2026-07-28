from __future__ import annotations

from ai_anime.modules.ai_assistant.public import (
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


def test_completion_notice_appends_without_replacing_existing_reply() -> None:
    existing = "我已经检查完前置条件，下一步会启动第 1 个任务。"
    notice = (
        "当前任务已开始处理。请稍后让我查看当前任务进度，或在任务完成后再继续下一步。"
    )

    merged = completion_text_or_existing(notice, existing)

    assert merged.startswith(existing)
    assert notice in merged
    assert completion_text_or_existing(notice, merged) == merged
    assert completion_text_or_existing("stop=end_turn", existing) == existing


def test_stream_text_supports_cumulative_and_delta_events() -> None:
    assert merge_stream_text("你好", "你好，世界") == "你好，世界"
    assert merge_stream_text("你好", "，世界") == "你好，世界"
    assert merge_stream_text("你好，世界", "世界") == "你好，世界"
    assert merge_stream_text("你好", "") == "你好"


def test_suppresses_partial_labeled_transcript_replay_before_current_prompt() -> None:
    replay = "User: 之前的问题\nAssistant: 之前的回答\nUser: 另一条旧问题"

    assert (
        strip_replayed_chat_response(
            replay,
            previous_assistant=[],
            current_prompt="现在的问题",
            suppress_partial_replay=True,
        )
        == ""
    )


def test_keeps_reply_after_current_prompt_in_replayed_transcript() -> None:
    replay = (
        "User: 之前的问题\n"
        "Assistant: 之前的回答\n"
        "User: 现在的问题\n"
        "Assistant: 这是新的回复"
    )

    assert (
        strip_replayed_chat_response(
            replay,
            previous_assistant=[],
            current_prompt="现在的问题",
            suppress_partial_replay=True,
        )
        == "这是新的回复"
    )


def test_final_replay_strip_still_returns_unlabeled_content() -> None:
    assert (
        strip_replayed_chat_response(
            "正常的新回复",
            previous_assistant=[],
            current_prompt="现在的问题",
        )
        == "正常的新回复"
    )


def test_strips_unlabeled_assistant_history_sequence_before_new_reply() -> None:
    previous = [
        "你好！有什么我可以帮你的吗？",
        "你好！我是 Hermes Agent，你的 AI 助手。",
    ]
    replay = "".join(previous) + "当前任务失败了，我建议先重试脚本生成。"

    assert (
        strip_replayed_chat_response(
            replay,
            previous_assistant=previous,
            current_prompt="继续",
            suppress_partial_replay=True,
        )
        == "当前任务失败了，我建议先重试脚本生成。"
    )


def test_stored_and_streamed_replay_keep_their_existing_full_match_semantics() -> None:
    previous = ["你好！有什么可以帮你？"]

    assert strip_stored_assistant_replay(previous[0], previous) == ""
    assert strip_streamed_assistant_replay(previous[0], previous) == previous[0]
    assert (
        strip_streamed_assistant_replay(
            previous[0],
            previous,
            suppress_partial_replay=True,
        )
        == ""
    )


def test_streamed_replay_handles_newline_separated_history() -> None:
    previous = ["第一条回复", "第二条回复"]

    assert (
        strip_streamed_assistant_replay(
            "第一条回复\n\n第二条回复\n\n新回复",
            previous,
            suppress_partial_replay=True,
        )
        == "新回复"
    )


def test_hides_internal_skill_tool_events_from_chat_cards() -> None:
    assert is_hidden_chat_tool_event(
        "skill",
        "→ skill view (ai_anime)\n内容: Loading skill 'ai_anime'",
    )
    assert not is_hidden_chat_tool_event(
        "ai_anime_pipeline_status",
        "→ ai_anime_pipeline_status\ncompleted",
    )


def test_trace_contents_split_on_blank_lines() -> None:
    assert split_trace_contents("first\nline\n\nsecond\n") == [
        "first\nline",
        "second",
    ]


def test_attachment_context_reports_metadata_without_embedding_content() -> None:
    text = text_with_attachment_context(
        "分析附件",
        [
            {
                "fileName": "frame.png",
                "type": "image",
                "mimeType": "image/png",
                "fileSize": 128,
                "url": "/uploads/frame.png",
                "path": "uploads/frame.png",
                "content": "raw-image-data",
            }
        ],
    )

    assert text.startswith("分析附件\n\n[CHAT_ATTACHMENTS]")
    assert "fileName=frame.png" in text
    assert "fileSize=128" in text
    assert "content=present" in text
    assert "raw-image-data" not in text
    assert text.endswith("[/CHAT_ATTACHMENTS]")
    assert text_with_attachment_context("普通消息", []) == "普通消息"


def test_message_and_final_text_projection_normalize_transport_values() -> None:
    assert message_content({"content": "  正文  "}) == "正文"
    assert message_content({"text": "  备用正文  "}) == "备用正文"
    assert message_content(None) == ""
    assert should_emit_final_text("新的  回复", "新的 回复") is False
    assert should_emit_final_text("新回复", "旧回复") is True
    assert should_emit_final_text("", "旧回复") is False


def test_tool_display_payload_extracts_name_and_body() -> None:
    assert tool_display_payload("→ search: first\nsecond") == (
        "search",
        "first\nsecond",
    )
    assert tool_display_payload("plain result", "lookup") == (
        "lookup",
        "plain result",
    )


def test_only_non_home_scopes_are_prewarmed_on_connect() -> None:
    assert should_prewarm_scope("home") is False
    assert should_prewarm_scope("project") is True
