"""Pure MCP configuration rules for agent runtimes."""

from __future__ import annotations

import json
from typing import Any


def codex_mcp_config_overrides(
    mcp_servers: dict[str, dict[str, Any]],
) -> tuple[str, ...]:
    overrides: list[str] = []
    for name, server in sorted(mcp_servers.items()):
        if str(server.get("type") or "stdio") != "stdio":
            raise ValueError(
                f"unsupported Codex MCP server type for {name}: {server.get('type')}"
            )
        command = str(server.get("command") or "").strip()
        if not command:
            raise ValueError(f"Codex MCP server {name} is missing command")
        args = server.get("args") or []
        if not isinstance(args, list):
            raise ValueError(f"Codex MCP server {name} args must be a list")
        prefix = f"mcp_servers.{name}"
        overrides.append(f"{prefix}.command={json.dumps(command, ensure_ascii=False)}")
        overrides.append(
            f"{prefix}.args={json.dumps([str(arg) for arg in args], ensure_ascii=False, separators=(',', ':'))}"
        )
        overrides.append(f"{prefix}.enabled=true")
    return tuple(overrides)
