from pathlib import Path

import pytest

from ai_anime.modules.ai_assistant.application import AgentBackendService
from ai_anime.modules.ai_assistant.infrastructure import LocalAgentBackendRuntime
from ai_anime.modules.ai_assistant.infrastructure import (
    agent_backend_runtime as runtime_module,
)


class StubAgentBackendRuntime:
    def __init__(
        self,
        preferred: str,
        available: dict[str, bool] | None = None,
    ) -> None:
        self.preferred = preferred
        self.available = available or {}

    def preferred_name(self) -> str:
        return self.preferred

    def is_available(self, backend: str) -> bool:
        return self.available.get(backend, False)

    def claude_cli_path(self) -> Path:
        return Path("/runtime/claude")

    def codex_bin_path(self) -> Path | None:
        return Path("/runtime/codex")

    def codex_model(self) -> str:
        return "codex-model"

    def claude_model(self) -> str | None:
        return "claude-model"


@pytest.mark.parametrize("backend", ["hermes", "codex", "claude"])
def test_explicit_available_backend_is_selected(backend):
    service = AgentBackendService(StubAgentBackendRuntime(backend, {backend: True}))

    assert service.name() == backend


@pytest.mark.parametrize(
    ("backend", "message"),
    [
        ("hermes", "AI_ANIME_CHAT_BACKEND=hermes requested"),
        ("codex", "AI_ANIME_CHAT_BACKEND=codex requested"),
        ("claude", "AI_ANIME_CHAT_BACKEND=claude requested"),
    ],
)
def test_explicit_unavailable_backend_does_not_fallback(backend, message):
    service = AgentBackendService(
        StubAgentBackendRuntime(
            backend,
            {"hermes": True, "codex": True, "claude": True, backend: False},
        )
    )

    with pytest.raises(RuntimeError, match=message):
        service.name()


@pytest.mark.parametrize(
    ("available", "expected"),
    [
        ({"codex": True, "claude": True}, "codex"),
        ({"codex": False, "claude": True}, "claude"),
        ({"codex": False, "claude": False}, "custom"),
    ],
)
def test_unknown_backend_keeps_existing_fallback_order(available, expected):
    service = AgentBackendService(StubAgentBackendRuntime("custom", available))

    assert service.name() == expected


def test_backend_availability_probe_does_not_raise_for_missing_explicit_backend():
    service = AgentBackendService(StubAgentBackendRuntime("hermes", {"hermes": False}))

    assert service.is_available() is False


def test_agent_backend_service_delegates_runtime_configuration():
    service = AgentBackendService(StubAgentBackendRuntime("hermes"))

    assert service.claude_cli_path() == Path("/runtime/claude")
    assert service.codex_bin_path() == Path("/runtime/codex")
    assert service.codex_model() == "codex-model"
    assert service.claude_model() == "claude-model"


def test_local_runtime_normalizes_preferred_backend(monkeypatch):
    runtime = LocalAgentBackendRuntime()
    monkeypatch.delenv("AI_ANIME_CHAT_BACKEND", raising=False)

    assert runtime.preferred_name() == "hermes"

    monkeypatch.setenv("AI_ANIME_CHAT_BACKEND", "  CoDeX  ")
    assert runtime.preferred_name() == "codex"


def test_local_runtime_uses_sdk_codex_by_default(monkeypatch):
    runtime = LocalAgentBackendRuntime()
    monkeypatch.delenv("CODEX_BIN", raising=False)
    monkeypatch.setattr(
        runtime_module.importlib.util,
        "find_spec",
        lambda name: object() if name == "openai_codex" else None,
    )

    assert runtime.codex_bin_path() is None
    assert runtime.is_available("codex") is True


def test_local_runtime_validates_explicit_codex_binary(monkeypatch, tmp_path):
    runtime = LocalAgentBackendRuntime()
    missing_bin = tmp_path / "missing-codex"
    monkeypatch.setenv("CODEX_BIN", str(missing_bin))
    monkeypatch.setattr(
        runtime_module.importlib.util,
        "find_spec",
        lambda name: object() if name == "openai_codex" else None,
    )

    assert runtime.codex_bin_path() == missing_bin
    assert runtime.is_available("codex") is False


def test_local_runtime_reads_agent_models(monkeypatch):
    runtime = LocalAgentBackendRuntime()
    monkeypatch.delenv("CODEX_MODEL", raising=False)
    monkeypatch.delenv("CLAUDE_MODEL", raising=False)

    assert runtime.codex_model() == "gpt-5.4"
    assert runtime.claude_model() is None

    monkeypatch.setenv("CODEX_MODEL", "  gpt-custom  ")
    monkeypatch.setenv("CLAUDE_MODEL", "  claude-custom  ")
    assert runtime.codex_model() == "gpt-custom"
    assert runtime.claude_model() == "claude-custom"
