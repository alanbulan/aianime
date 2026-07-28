"""Chat event delivery helpers."""

from typing import Any

from ai_anime.modules.ai_assistant.application.ports import ChatEventSink


async def emit_chat_event_best_effort(
    on_event: ChatEventSink,
    event: dict[str, Any],
) -> bool:
    try:
        await on_event(event)
        return True
    except Exception:
        return False


__all__ = ["emit_chat_event_best_effort"]
