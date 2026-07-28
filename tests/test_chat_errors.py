from ai_anime.api.chat_errors import chat_exception_event
from ai_anime.modules.ai_assistant.public import ChatScope
from ai_anime.modules.model_usage.public import (
    BillingRuleNotConfiguredError,
    InsufficientCreditsError,
)


def test_chat_exception_event_maps_busy_turn():
    error = RuntimeError("当前用户已有 AI 对话正在处理中，请稍后再试")

    result = chat_exception_event(
        error,
        turn_id="turn-1",
        scope=ChatScope(kind="project", id="project-a"),
    )

    assert result == {
        "type": "chat.busy",
        "turn_id": "turn-1",
        "scope": {"kind": "project", "id": "project-a"},
        "message": "当前用户已有 AI 对话正在处理中，请稍后再试",
    }


def test_chat_exception_event_maps_nested_billing_rule_error():
    error = RuntimeError("provider failed")
    error.__cause__ = BillingRuleNotConfiguredError(kind="chat", key="assistant")

    result = chat_exception_event(
        error,
        turn_id="turn-1",
        scope=ChatScope(kind="home"),
    )

    assert result == {
        "type": "error",
        "turn_id": "turn-1",
        "message": "计费规则未配置，请联系管理员设置积分规则",
        "data": {
            "error_code": "BILLING_RULE_NOT_CONFIGURED",
            "message": "计费规则未配置，请联系管理员设置积分规则",
            "billing_kind": "chat",
            "billing_key": "assistant",
        },
    }


def test_chat_exception_event_maps_nested_insufficient_credits_error():
    error = RuntimeError("provider failed")
    error.__cause__ = InsufficientCreditsError(
        user_id="user-1",
        cost=12,
        balance=3,
    )

    result = chat_exception_event(
        error,
        turn_id="turn-1",
        scope=ChatScope(kind="home"),
    )

    assert result == {
        "type": "error",
        "turn_id": "turn-1",
        "message": "积分不足，请联系管理员充值",
        "data": {
            "error_code": "INSUFFICIENT_CREDITS",
            "message": "积分不足，请联系管理员充值",
            "user_id": "user-1",
            "required": 12,
            "balance": 3,
        },
    }


def test_chat_exception_event_falls_back_to_exception_message():
    result = chat_exception_event(
        RuntimeError("backend unavailable"),
        turn_id="turn-1",
        scope=ChatScope(kind="home"),
    )

    assert result == {
        "type": "error",
        "turn_id": "turn-1",
        "message": "backend unavailable",
    }
