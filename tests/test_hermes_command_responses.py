from ai_anime.modules.ai_assistant.infrastructure.hermes.command_responses import (
    help_response,
    localize_runtime_response,
    model_response,
)
from ai_anime.modules.ai_assistant.infrastructure.hermes.model_route import (
    decode_model_route,
    decode_model_selection,
    encode_model_route,
)


def test_model_route_round_trip_accepts_acp_provider_prefix() -> None:
    encoded = encode_model_route("byok:provider-one:model-a", "xhigh")

    assert decode_model_route(encoded) == "byok:provider-one:model-a"
    assert decode_model_route(f"custom:{encoded}") == "byok:provider-one:model-a"
    assert decode_model_route("ordinary-model") is None
    selection = decode_model_selection(encoded)
    assert selection is not None
    assert selection.reasoning_effort == "xhigh"


def test_help_and_model_responses_describe_real_product_semantics() -> None:
    help_text = help_response()

    assert "/model" in help_text
    assert "/steer" not in help_text
    assert "Skills" in help_text
    assert "遵循右上角设置中的模型优先级" in model_response(None)
    assert "仅影响当前对话" in model_response("cloud:text-model")
    assert "请从 /model 打开的模型列表中选择" in model_response(
        None,
        has_arguments=True,
    )


def test_runtime_command_feedback_is_localized_and_compact_noop_is_explicit() -> None:
    assert localize_runtime_response(
        "compact",
        "Context compressed: 2 -> 2 messages\n~21,094 -> ~21,094 tokens",
    ) == "当前上下文均为必须保留的近期内容，本次无需压缩。"
    assert localize_runtime_response(
        "reset",
        "Conversation history cleared.",
    ) == "已清空当前对话的模型上下文；界面中的聊天记录仍会保留。"
    assert localize_runtime_response(
        "version",
        "Hermes Agent v0.19.0",
    ) == "AI anime 助手运行内核：Hermes v0.19.0"


def test_tool_feedback_includes_localized_names_and_full_descriptions() -> None:
    localized = localize_runtime_response(
        "tools",
        "Available tools (2):\n  ai_anime_get: Read project data\n  todo: Track work",
    )

    assert localized == (
        "当前可用工具（2 个）：\n"
        "- `ai_anime_get`（读取项目 API）："
        "读取 AI 漫剧项目、资产和状态数据；只执行 GET 查询，不修改业务内容。\n"
        "- `todo`（管理任务清单）："
        "创建和更新当前会话的多步骤任务清单，持续记录待办、进行中与完成状态。"
    )
    assert "Read project data" not in localized
