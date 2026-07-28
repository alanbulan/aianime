"""Ports required by AI Assistant application services."""

from __future__ import annotations

from typing import Any, Protocol

from ai_anime.modules.ai_assistant.domain import ChatScope


class AgentThreadSessions(Protocol):
    def get_active(self, username: str, backend: str) -> str | None: ...

    def set_active(self, username: str, backend: str, thread_id: str) -> None: ...


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


class ChatRunLocks(Protocol):
    def acquire(self, username: str, project: str) -> str: ...

    def release(self, username: str, project: str, lock_id: str) -> None: ...

    def is_active(self, username: str, project: str = "") -> bool: ...

    def force_release(self, username: str, project: str) -> None: ...

    async def maintain(self, username: str, project: str, lock_id: str) -> None: ...
