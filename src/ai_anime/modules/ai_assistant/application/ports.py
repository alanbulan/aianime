"""Ports required by AI Assistant application services."""

from __future__ import annotations

from typing import Any, Protocol

from ai_anime.modules.ai_assistant.domain import ChatScope


class ChatHistory(Protocol):
    def append_message(
        self,
        username: str,
        scope: ChatScope,
        role: str,
        content: str,
        media: list[dict[str, Any]] | None = None,
        *,
        turn_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]: ...

    def append_ui_event(
        self,
        username: str,
        scope: ChatScope,
        turn_id: str,
        event: dict[str, Any],
    ) -> dict[str, Any]: ...

    def list_messages(
        self,
        username: str,
        scope: ChatScope,
        *,
        limit: int = 50,
    ) -> list[dict[str, Any]]: ...
