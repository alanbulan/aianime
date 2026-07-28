"""Local MCP tool configuration for page-level AI agents."""

from __future__ import annotations

import sys
from typing import Any

from ai_anime.modules.ai_assistant.domain import codex_mcp_config_overrides


class LocalAgentToolConfiguration:
    @staticmethod
    def mcp_servers() -> dict[str, dict[str, Any]]:
        return {
            "ai_anime": {
                "type": "stdio",
                "command": sys.executable,
                "args": ["-m", "ai_anime.chat.ai_anime_mcp"],
            }
        }

    def codex_config_overrides(self) -> tuple[str, ...]:
        return codex_mcp_config_overrides(self.mcp_servers())
