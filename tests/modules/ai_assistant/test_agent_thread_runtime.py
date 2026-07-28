from pathlib import Path

import pytest

from ai_anime.modules.ai_assistant.infrastructure import LocalAgentThreadRuntime
from ai_anime.modules.ai_assistant.infrastructure import (
    agent_thread_runtime as runtime_module,
)
from ai_anime.modules.ai_assistant.public import get_agent_thread_runtime


class StubBackend:
    def claude_cli_path(self) -> Path:
        return Path("/tools/claude")

    def claude_model(self) -> str:
        return "claude-test"

    def codex_bin_path(self) -> Path:
        return Path("/tools/codex")

    def codex_model(self) -> str:
        return "gpt-test"


class StubSessions:
    def __init__(self, active: dict[tuple[str, str], str] | None = None) -> None:
        self.active = active or {}

    def get_active(self, username: str, backend: str) -> str | None:
        return self.active.get((username, backend))

    def set_active(self, username: str, backend: str, thread_id: str) -> None:
        self.active[(username, backend)] = thread_id


class StubWorkspace:
    def __init__(self, root: Path) -> None:
        self.root = root

    def ensure_claude(
        self,
        username: str,
        project: str,
        agent_token: str = "",
    ) -> Path:
        return self.root / "claude"

    def ensure_codex(self, username: str) -> Path:
        return self.root / "codex"

    def build_environment(
        self,
        username: str,
        project: str,
        agent_token: str = "",
    ) -> dict[str, str]:
        return {
            "AI_ANIME_USERNAME": username,
            "AI_ANIME_PROJECT": project,
            "AI_ANIME_AGENT_TOKEN": agent_token,
        }


class StubToolConfiguration:
    def codex_config_overrides(self) -> tuple[str, ...]:
        return ("mcp_servers.ai_anime.enabled=true",)


def _runtime(tmp_path: Path, sessions: StubSessions) -> LocalAgentThreadRuntime:
    return LocalAgentThreadRuntime(
        StubBackend(),
        sessions,
        StubWorkspace(tmp_path),
        StubToolConfiguration(),
    )


def test_agent_thread_runtime_composition_returns_one_process_instance():
    assert get_agent_thread_runtime() is get_agent_thread_runtime()


def test_agent_thread_runtime_resumes_claude_session(monkeypatch, tmp_path):
    captured = {}
    resumed_thread = object()

    class FakeClaudeClient:
        def __init__(self, **kwargs):
            captured.update(kwargs)

        def thread_resume(self, thread_id):
            captured["thread_id"] = thread_id
            return resumed_thread

        def thread_start(self):
            pytest.fail("stored Claude session should be resumed")

    monkeypatch.setattr(runtime_module, "ClaudeSdkClient", FakeClaudeClient)
    sessions = StubSessions({("alice", "claude"): "claude-thread"})

    thread = _runtime(tmp_path, sessions).open_claude(
        "alice",
        "project-a",
        "agent-token",
    )

    assert thread is resumed_thread
    assert captured == {
        "cli_path": Path("/tools/claude"),
        "cwd": tmp_path / "claude",
        "env": {
            "AI_ANIME_USERNAME": "alice",
            "AI_ANIME_PROJECT": "project-a",
            "AI_ANIME_AGENT_TOKEN": "agent-token",
        },
        "model": "claude-test",
        "thread_id": "claude-thread",
    }


def test_agent_thread_runtime_starts_codex_with_tool_configuration(
    monkeypatch,
    tmp_path,
):
    captured = {}
    started_thread = object()

    class FakeCodexClient:
        def __init__(self, **kwargs):
            captured.update(kwargs)

        def thread_resume(self, thread_id):
            pytest.fail("missing Codex session should start a new thread")

        def thread_start(self):
            return started_thread

    monkeypatch.setattr(runtime_module, "CodexClient", FakeCodexClient)

    thread = _runtime(tmp_path, StubSessions()).open_codex(
        "alice",
        "project-a",
        "agent-token",
    )

    assert thread is started_thread
    assert captured == {
        "codex_bin": Path("/tools/codex"),
        "cwd": tmp_path / "codex",
        "env": {
            "AI_ANIME_USERNAME": "alice",
            "AI_ANIME_PROJECT": "project-a",
            "AI_ANIME_AGENT_TOKEN": "agent-token",
        },
        "model": "gpt-test",
        "config_overrides": ("mcp_servers.ai_anime.enabled=true",),
    }


@pytest.mark.anyio
async def test_agent_thread_runtime_remembers_and_interrupts_threads(
    monkeypatch,
    tmp_path,
):
    interrupted = []

    async def interrupt_claude(thread_id):
        interrupted.append(("claude", thread_id))
        return True

    def interrupt_codex(thread_id, turn_id):
        interrupted.append(("codex", thread_id, turn_id))
        return True

    monkeypatch.setattr(
        runtime_module,
        "interrupt_live_claude_client",
        interrupt_claude,
    )
    monkeypatch.setattr(
        runtime_module,
        "interrupt_live_codex_turn",
        interrupt_codex,
    )
    sessions = StubSessions()
    runtime = _runtime(tmp_path, sessions)

    runtime.remember("alice", "codex", "codex-thread")

    assert sessions.get_active("alice", "codex") == "codex-thread"
    assert await runtime.interrupt("claude", "claude-thread", "") is True
    assert await runtime.interrupt("codex", "codex-thread", "turn-1") is True
    assert await runtime.interrupt("codex", "codex-thread", "") is False
    assert interrupted == [
        ("claude", "claude-thread"),
        ("codex", "codex-thread", "turn-1"),
    ]


@pytest.mark.anyio
async def test_agent_thread_runtime_accepts_closed_stream_after_interrupt(
    monkeypatch,
    tmp_path,
):
    async def interrupt_closed_claude(thread_id):
        raise RuntimeError("closed stdout")

    def interrupt_closed_codex(thread_id, turn_id):
        raise RuntimeError("app-server closed stdout")

    monkeypatch.setattr(
        runtime_module,
        "interrupt_live_claude_client",
        interrupt_closed_claude,
    )
    monkeypatch.setattr(
        runtime_module,
        "interrupt_live_codex_turn",
        interrupt_closed_codex,
    )
    runtime = _runtime(tmp_path, StubSessions())

    assert await runtime.interrupt("claude", "claude-thread", "") is True
    assert await runtime.interrupt("codex", "codex-thread", "turn-1") is True
