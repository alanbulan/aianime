"""Ports required by AI Assistant application services."""

from __future__ import annotations

from pathlib import Path
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


class ChatRunLocks(Protocol):
    def acquire(self, username: str, project: str) -> str: ...

    def release(self, username: str, project: str, lock_id: str) -> None: ...

    def is_active(self, username: str, project: str = "") -> bool: ...

    def force_release(self, username: str, project: str) -> None: ...

    async def maintain(self, username: str, project: str, lock_id: str) -> None: ...


class UserPreferences(Protocol):
    def load(self, username: str) -> str: ...


class AgentBackend(Protocol):
    def name(self) -> str: ...

    def is_available(self) -> bool: ...

    def claude_cli_path(self) -> Path: ...

    def codex_bin_path(self) -> Path | None: ...

    def codex_model(self) -> str: ...

    def claude_model(self) -> str | None: ...


class AgentBackendRuntime(Protocol):
    def preferred_name(self) -> str: ...

    def is_available(self, backend: str) -> bool: ...

    def claude_cli_path(self) -> Path: ...

    def codex_bin_path(self) -> Path | None: ...

    def codex_model(self) -> str: ...

    def claude_model(self) -> str | None: ...


class AgentWorkspace(Protocol):
    def ensure_claude(
        self,
        username: str,
        project: str,
        agent_token: str = "",
    ) -> Path: ...

    def ensure_codex(self, username: str) -> Path: ...

    def build_environment(
        self,
        username: str,
        project: str,
        agent_token: str = "",
    ) -> dict[str, str]: ...


class AgentToolConfiguration(Protocol):
    def mcp_servers(self) -> dict[str, dict[str, Any]]: ...

    def codex_config_overrides(self) -> tuple[str, ...]: ...
