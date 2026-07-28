import json
import sys
from pathlib import Path

import pytest

from ai_anime.chat.backend_sdk import CodexClient
from ai_anime.modules.ai_assistant.domain import codex_mcp_config_overrides
from ai_anime.modules.ai_assistant.infrastructure import LocalAgentToolConfiguration
from ai_anime.modules.ai_assistant.public import get_agent_tool_configuration


def test_agent_tool_configuration_returns_one_process_instance():
    assert get_agent_tool_configuration() is get_agent_tool_configuration()


def test_local_agent_tool_configuration_uses_current_python_runtime():
    servers = LocalAgentToolConfiguration().mcp_servers()

    assert servers == {
        "ai_anime": {
            "type": "stdio",
            "command": sys.executable,
            "args": ["-m", "ai_anime.chat.ai_anime_mcp"],
        }
    }


def test_local_agent_tool_configuration_builds_codex_overrides():
    overrides = LocalAgentToolConfiguration().codex_config_overrides()

    expected_command = json.dumps(sys.executable, ensure_ascii=False)
    assert overrides == (
        f"mcp_servers.ai_anime.command={expected_command}",
        'mcp_servers.ai_anime.args=["-m","ai_anime.chat.ai_anime_mcp"]',
        "mcp_servers.ai_anime.enabled=true",
    )


def test_codex_client_carries_agent_tool_overrides(tmp_path):
    overrides = LocalAgentToolConfiguration().codex_config_overrides()
    client = CodexClient(
        codex_bin=Path("/usr/local/bin/codex"),
        cwd=tmp_path,
        env={"AI_ANIME_AGENT_TOKEN": "token"},
        model="gpt-5.4",
        config_overrides=overrides,
    )

    thread = client.thread_start()

    assert thread._config_overrides == overrides


def test_codex_mcp_overrides_sort_servers_and_stringify_arguments():
    overrides = codex_mcp_config_overrides(
        {
            "zeta": {"command": "z-command", "args": [1]},
            "alpha": {"type": "stdio", "command": "a-command", "args": None},
        }
    )

    assert overrides == (
        'mcp_servers.alpha.command="a-command"',
        "mcp_servers.alpha.args=[]",
        "mcp_servers.alpha.enabled=true",
        'mcp_servers.zeta.command="z-command"',
        'mcp_servers.zeta.args=["1"]',
        "mcp_servers.zeta.enabled=true",
    )


def test_codex_mcp_overrides_reject_non_stdio_server():
    with pytest.raises(
        ValueError,
        match="unsupported Codex MCP server type for remote: http",
    ):
        codex_mcp_config_overrides({"remote": {"type": "http", "command": "ignored"}})


def test_codex_mcp_overrides_require_command():
    with pytest.raises(ValueError, match="Codex MCP server empty is missing command"):
        codex_mcp_config_overrides({"empty": {"type": "stdio"}})


def test_codex_mcp_overrides_require_argument_list():
    with pytest.raises(
        ValueError, match="Codex MCP server invalid args must be a list"
    ):
        codex_mcp_config_overrides(
            {"invalid": {"command": "command", "args": "--flag"}}
        )
