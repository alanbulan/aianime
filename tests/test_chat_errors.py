from ai_anime.api.routes.ai_assistant.errors import chat_exception_event
from ai_anime.modules.ai_assistant.public import ChatScope
from ai_anime.modules.model_usage.public import ModelQuotaExceededError


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
        "scope": {
            "kind": "project",
            "id": "project-a",
            "conversationId": "main",
        },
        "message": "当前用户已有 AI 对话正在处理中，请稍后再试",
    }


def test_chat_exception_event_maps_nested_model_quota_error():
    error = RuntimeError("provider failed")
    error.__cause__ = ModelQuotaExceededError(
        user_id="user-1",
        required_units=12,
        available_units=3,
    )

    result = chat_exception_event(
        error,
        turn_id="turn-1",
        scope=ChatScope(kind="home"),
    )

    assert result == {
        "type": "error",
        "turn_id": "turn-1",
        "message": "云端模型配额不足，请联系管理员",
        "data": {
            "error_code": "INSUFFICIENT_CREDITS",
            "message": "云端模型配额不足，请联系管理员",
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
