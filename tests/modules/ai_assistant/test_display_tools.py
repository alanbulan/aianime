from ai_anime.modules.ai_assistant.public import (
    display_tool_call_key,
    extract_display_tool_call,
    infer_display_tool_call_from_text,
    is_display_tool_name,
)


def test_display_tool_call_key_is_stable_across_argument_order():
    assert display_tool_call_key("ai_anime_get_sketches", {"b": 2, "a": 1}) == (
        'ai_anime_get_sketches:{"a": 1, "b": 2}'
    )


def test_display_tool_name_accepts_only_known_tools():
    assert is_display_tool_name(" ai_anime_get_sketches ")
    assert is_display_tool_name("ai_anime_get_final_video")
    assert not is_display_tool_name("ai_anime_pipeline_status")


def test_extract_final_video_display_call():
    assert extract_display_tool_call({
        "title": "ai_anime_get_final_video",
        "arguments": '{"episode": 2}',
    }) == ("ai_anime_get_final_video", {"episode": 2})


def test_infer_display_tool_call_recovers_sketch_display_promise():
    inferred = infer_display_tool_call_from_text(
        "全部显示",
        "我来为您显示全部37个beat的草图。正在为您展示第1集前12个beat的草图：",
        [],
    )

    assert inferred == ("ai_anime_get_sketches", {"episode": 1})


def test_infer_display_tool_call_uses_recent_context_for_short_reply():
    inferred = infer_display_tool_call_from_text(
        "全部显示",
        "正在为您展示前12个。",
        ["如果您需要查看全部37个草图，我可以分页显示。"],
    )

    assert inferred == ("ai_anime_get_sketches", {"episode": 1})


def test_infer_display_tool_call_ignores_progress_status_language():
    inferred = infer_display_tool_call_from_text(
        "进度怎样了",
        "当前进度如下：草图生成已完成，下面展示进度表。",
        ["如果您需要查看全部37个草图，我可以分页显示。"],
    )

    assert inferred is None


def test_infer_display_tool_call_requires_user_sketch_display_intent():
    inferred = infer_display_tool_call_from_text(
        "看一下第2集草图",
        "正在为您展示第2集草图。",
        [],
    )

    assert inferred == ("ai_anime_get_sketches", {"episode": 2})


def test_infer_display_tool_call_uses_sketch_candidate_tool_for_pool_terms():
    inferred = infer_display_tool_call_from_text(
        "看第1集 Beat 3 的草图候选池",
        "正在为您展示 Beat 3 的草图候选。",
        [],
    )

    assert inferred == ("ai_anime_get_sketch_candidates", {"episode": 1, "beat": 3})


def test_extract_display_tool_call_uses_named_tool_field():
    inferred = extract_display_tool_call(
        {
            "sessionUpdate": "tool_call",
            "title": "tool",
            "name": "ai_anime_get_sketches",
            "content": [
                {
                    "type": "content",
                    "content": {"type": "text", "text": '{"episode": 1}'},
                }
            ],
        }
    )

    assert inferred == ("ai_anime_get_sketches", {"episode": 1})
