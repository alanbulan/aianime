"""Best-effort pre-warming for the bundled Hermes runtime."""

from ai_anime.modules.ai_assistant.application.ports import HermesRuntime


class HermesRuntimePrewarmer:
    def __init__(self, runtime: HermesRuntime) -> None:
        self._runtime = runtime

    async def prewarm(
        self,
        username: str,
        *,
        project: str | None = None,
        conversation_id: str = "main",
    ) -> None:
        try:
            await self._runtime.prewarm(
                username,
                scope_kind="project" if project else "home",
                project_id=project or None,
                conversation_id=conversation_id,
            )
        except Exception:
            return


__all__ = ["HermesRuntimePrewarmer"]
