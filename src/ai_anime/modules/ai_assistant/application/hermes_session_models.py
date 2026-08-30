"""Per-conversation model routing for the Hermes assistant runtime."""

from ai_anime.modules.ai_assistant.application.ports import HermesRuntime
from ai_anime.modules.ai_assistant.domain import ChatScope


class HermesSessionModels:
    def __init__(self, runtime: HermesRuntime) -> None:
        self._runtime = runtime

    async def current(
        self,
        username: str,
        scope: ChatScope,
    ) -> tuple[str | None, str | None]:
        thread = await self._thread(username, scope)
        return await thread.get_model_route()

    async def select(
        self,
        username: str,
        scope: ChatScope,
        selector: str | None,
        reasoning_effort: str | None = None,
    ) -> tuple[str | None, str | None]:
        thread = await self._thread(username, scope)
        return await thread.set_model_route(selector, reasoning_effort)

    async def _thread(self, username: str, scope: ChatScope):
        return await self._runtime.get_for_user(
            username,
            scope_kind=scope.kind,
            project_id=scope.id if scope.kind == "project" else None,
            conversation_id=scope.conversation_id,
        )


__all__ = ["HermesSessionModels"]
