"""Map Chat failures to the existing WebSocket event contract."""

from __future__ import annotations

from typing import Any

from ai_anime.modules.ai_assistant.public import ChatScope
from ai_anime.modules.model_usage.public import (
    MODEL_QUOTA_EXCEEDED_MESSAGE,
    find_model_quota_error,
    model_quota_payload,
)

_CHAT_BUSY_MESSAGE = "当前用户已有 AI 对话正在处理中"


def chat_exception_event(
    error: Exception,
    *,
    turn_id: str,
    scope: ChatScope,
) -> dict[str, Any]:
    message = str(error)
    if _CHAT_BUSY_MESSAGE in message:
        return {
            "type": "chat.busy",
            "turn_id": turn_id,
            "scope": scope.to_dict(),
            "message": message,
        }

    quota_error = find_model_quota_error(error)
    if quota_error is not None:
        return {
            "type": "error",
            "turn_id": turn_id,
            "message": MODEL_QUOTA_EXCEEDED_MESSAGE,
            "data": model_quota_payload(quota_error),
        }

    return {"type": "error", "turn_id": turn_id, "message": message}


__all__ = ["chat_exception_event"]
