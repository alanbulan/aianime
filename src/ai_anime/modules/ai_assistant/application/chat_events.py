"""Chat event delivery helpers."""

from typing import Any

from ai_anime.modules.ai_assistant.application.ports import ChatEventSink


async def emit_chat_event(
    on_event: ChatEventSink,
    event: dict[str, Any],
) -> None:
    """Deliver a live event and keep disconnects visible to the producer."""

    await on_event(event)


async def emit_chat_event_best_effort(
    on_event: ChatEventSink,
    event: dict[str, Any],
) -> bool:
    try:
        await on_event(event)
        return True
    except Exception:
        return False


__all__ = ["emit_chat_event", "emit_chat_event_best_effort"]
