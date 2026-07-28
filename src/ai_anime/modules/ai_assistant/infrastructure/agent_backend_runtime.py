"""Local environment adapter for agent backend runtime settings."""

from __future__ import annotations

import importlib.util
import os
import shutil
from pathlib import Path


class LocalAgentBackendRuntime:
    @staticmethod
    def preferred_name() -> str:
        return (
            os.environ.get("AI_ANIME_CHAT_BACKEND") or "hermes"
        ).strip().lower() or "hermes"

    def is_available(self, backend: str) -> bool:
        if backend == "claude":
            return self.claude_cli_path().exists() and (
                importlib.util.find_spec("claude_agent_sdk") is not None
            )
        if backend == "codex":
            codex_bin = self.codex_bin_path()
            return (
                codex_bin is None or codex_bin.exists()
            ) and importlib.util.find_spec("openai_codex") is not None
        if backend == "hermes":
            try:
                from ai_anime.chat.hermes_pool import (
                    is_hermes_backend_available as check,
                )
            except ImportError:
                return False
            return check()
        return False

    @staticmethod
    def claude_cli_path() -> Path:
        configured = os.environ.get("CLAUDE_CLI_PATH", "").strip()
        if configured:
            return Path(configured).expanduser()
        resolved = shutil.which("claude")
        if resolved:
            return Path(resolved)
        return Path.home() / ".local" / "bin" / "claude"

    @staticmethod
    def codex_bin_path() -> Path | None:
        configured = os.environ.get("CODEX_BIN", "").strip()
        if configured:
            return Path(configured).expanduser()
        return None

    @staticmethod
    def codex_model() -> str:
        return os.environ.get("CODEX_MODEL", "gpt-5.4").strip() or "gpt-5.4"

    @staticmethod
    def claude_model() -> str | None:
        model = os.environ.get("CLAUDE_MODEL", "").strip()
        return model or None
