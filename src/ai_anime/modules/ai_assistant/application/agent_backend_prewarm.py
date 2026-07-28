"""Best-effort agent backend pre-warming."""

from ai_anime.modules.ai_assistant.application.ports import (
    AgentBackend,
    HermesRuntime,
)


class AgentBackendPrewarmer:
    def __init__(self, backend: AgentBackend, hermes_runtime: HermesRuntime) -> None:
        self._backend = backend
        self._hermes_runtime = hermes_runtime

    async def prewarm(self, username: str, *, project: str | None = None) -> None:
        try:
            if self._backend.name() != "hermes":
                return
            await self._hermes_runtime.prewarm(
                username,
                scope_kind="project" if project else "home",
                project_id=project or None,
            )
        except Exception:
            return


__all__ = ["AgentBackendPrewarmer"]
