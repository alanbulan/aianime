"""Ports required by AI Assistant application services."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any, AsyncIterator, Protocol

from ai_anime.modules.ai_assistant.domain import ChatScope

ChatEventSink = Callable[[dict[str, Any]], Awaitable[None]]


class HermesThread(Protocol):
    def stream(
        self,
        prompt: str,
        *,
        current_project: str | None = None,
    ) -> AsyncIterator[Any]: ...


class HermesRuntime(Protocol):
    async def get_for_user(
        self,
        username: str,
        *,
        scope_kind: str,
        project_id: str | None,
    ) -> HermesThread: ...

    async def prewarm(
        self,
        username: str,
        *,
        scope_kind: str,
        project_id: str | None,
    ) -> None: ...

    async def set_scope_for_user(
        self,
        username: str,
        *,
        scope_kind: str,
        project_id: str | None,
    ) -> bool: ...

    async def close_user(self, username: str) -> bool: ...


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

    def append_project_message(
        self,
        username: str,
        project: str,
        role: str,
        content: str,
        media: list[dict[str, Any]] | None = None,
        *,
        project_dir: str | Path | None = None,
        project_state_dir: str | Path | None = None,
    ) -> dict[str, Any]: ...

    def append_project_trace_messages(
        self,
        username: str,
        project: str,
        contents: list[str],
        *,
        project_dir: str | Path | None = None,
        project_state_dir: str | Path | None = None,
    ) -> list[dict[str, Any]]: ...

    def list_project_messages(
        self,
        username: str,
        project: str,
        *,
        project_dir: str | Path | None = None,
        project_state_dir: str | Path | None = None,
        limit: int = 50,
    ) -> list[dict[str, Any]]: ...

    def list_project_trace_contents(
        self,
        username: str,
        project: str,
        *,
        project_dir: str | Path | None = None,
        project_state_dir: str | Path | None = None,
    ) -> list[str]: ...

    def replace_project_trace_messages(
        self,
        username: str,
        project: str,
        messages: list[dict[str, Any]],
        *,
        project_dir: str | Path | None = None,
        project_state_dir: str | Path | None = None,
    ) -> None: ...


class JsonRenderErrors(Protocol):
    def record(self, error: ValueError, body: str) -> None: ...


class DisplayFallbackGateway(Protocol):
    def get(self, path: str, token: str) -> dict[str, Any]: ...


class ProjectMediaFiles(Protocol):
    def resolve_project_dir(
        self,
        username: str,
        project: str,
        project_dir: str | Path | None = None,
    ) -> Path: ...

    def exists(self, project_dir: Path, relative_path: str) -> bool: ...

    def static_url(
        self,
        project: str,
        project_dir: Path,
        relative_path: str,
    ) -> str: ...


class ChatRunLocks(Protocol):
    def acquire(self, username: str, project: str) -> str: ...

    def release(self, username: str, project: str, lock_id: str) -> None: ...

    def is_active(self, username: str, project: str = "") -> bool: ...

    def force_release(self, username: str, project: str) -> None: ...

    async def maintain(self, username: str, project: str, lock_id: str) -> None: ...


class UserPreferences(Protocol):
    def load(self, username: str) -> str: ...
