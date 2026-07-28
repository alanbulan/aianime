"""Agent backend selection and runtime configuration."""

from pathlib import Path

from ai_anime.modules.ai_assistant.application.ports import AgentBackendRuntime

_UNAVAILABLE_MESSAGES = {
    "hermes": (
        "AI_ANIME_CHAT_BACKEND=hermes requested but hermes is unavailable. "
        "Run `uv tool install 'hermes-agent[acp]'`, "
        "then run `hermes doctor` to diagnose."
    ),
    "codex": (
        "AI_ANIME_CHAT_BACKEND=codex requested but Codex is unavailable. "
        "Install `openai-codex`/Codex Python SDK support in the backend environment "
        "and ensure CODEX_BIN points to a valid codex binary."
    ),
    "claude": (
        "AI_ANIME_CHAT_BACKEND=claude requested but Claude is unavailable. "
        "Install claude-agent-sdk and ensure CLAUDE_CLI_PATH points to a valid "
        "claude binary."
    ),
}


class AgentBackendService:
    def __init__(self, runtime: AgentBackendRuntime) -> None:
        self._runtime = runtime

    def name(self) -> str:
        preferred = self._runtime.preferred_name()
        if preferred in _UNAVAILABLE_MESSAGES:
            if self._runtime.is_available(preferred):
                return preferred
            raise RuntimeError(_UNAVAILABLE_MESSAGES[preferred])
        if self._runtime.is_available("codex"):
            return "codex"
        if self._runtime.is_available("claude"):
            return "claude"
        return preferred

    def is_available(self) -> bool:
        try:
            backend = self.name()
        except RuntimeError:
            return False
        if backend not in _UNAVAILABLE_MESSAGES:
            return False
        return self._runtime.is_available(backend)

    def claude_cli_path(self) -> Path:
        return self._runtime.claude_cli_path()

    def codex_bin_path(self) -> Path | None:
        return self._runtime.codex_bin_path()

    def codex_model(self) -> str:
        return self._runtime.codex_model()

    def claude_model(self) -> str | None:
        return self._runtime.claude_model()
