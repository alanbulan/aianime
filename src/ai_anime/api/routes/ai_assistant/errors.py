"""Map Chat failures to the existing WebSocket event contract."""

from __future__ import annotations

from typing import Any

from ai_anime.modules.ai_assistant.public import ChatScope
from ai_anime.modules.model_usage.public import (
    BILLING_RULE_NOT_CONFIGURED_MESSAGE,
    INSUFFICIENT_CREDITS_MESSAGE,
    billing_rule_not_configured_payload,
    find_billing_rule_not_configured_error,
    find_insufficient_credits_error,
    insufficient_credits_payload,
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

    billing_rule_error = find_billing_rule_not_configured_error(error)
    if billing_rule_error is not None:
        return {
            "type": "error",
            "turn_id": turn_id,
            "message": BILLING_RULE_NOT_CONFIGURED_MESSAGE,
            "data": billing_rule_not_configured_payload(billing_rule_error),
        }

    insufficient_error = find_insufficient_credits_error(error)
    if insufficient_error is not None:
        return {
            "type": "error",
            "turn_id": turn_id,
            "message": INSUFFICIENT_CREDITS_MESSAGE,
            "data": insufficient_credits_payload(insufficient_error),
        }

    return {"type": "error", "turn_id": turn_id, "message": message}


__all__ = ["chat_exception_event"]
