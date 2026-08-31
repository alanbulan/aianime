"""Per-conversation model routing for the Hermes assistant runtime."""

from pathlib import Path

from ai_anime.modules.ai_assistant.application.ports import (
    HermesThread,
    SessionModelRouteRejected,
    SessionModelRouteStore,
)
from ai_anime.modules.ai_assistant.domain import ChatScope


class HermesSessionModels:
    def __init__(self, routes: SessionModelRouteStore) -> None:
        self._routes = routes

    async def current(
        self,
        username: str,
        scope: ChatScope,
        *,
        project_dir: str | Path | None = None,
        project_state_dir: str | Path | None = None,
    ) -> tuple[str | None, str | None]:
        stored = self._routes.load_model_route(
            username,
            scope,
            project_dir=project_dir,
            project_state_dir=project_state_dir,
        )
        return stored if stored is not None else (None, None)

    async def select(
        self,
        username: str,
        scope: ChatScope,
        selector: str | None,
        reasoning_effort: str | None = None,
        *,
        project_dir: str | Path | None = None,
        project_state_dir: str | Path | None = None,
    ) -> tuple[str | None, str | None]:
        selected = (
            str(selector or "").strip() or None,
            str(reasoning_effort or "").strip() or None,
        )
        self._routes.save_model_route(
            username,
            scope,
            *selected,
            project_dir=project_dir,
            project_state_dir=project_state_dir,
        )
        return selected

    async def apply_to(
        self,
        thread: HermesThread,
        username: str,
        scope: ChatScope,
        *,
        project_dir: str | Path | None = None,
        project_state_dir: str | Path | None = None,
    ) -> tuple[str | None, str | None] | None:
        stored = self._routes.load_model_route(
            username,
            scope,
            project_dir=project_dir,
            project_state_dir=project_state_dir,
        )
        if stored is None:
            return None
        try:
            return await thread.set_model_route(*stored)
        except SessionModelRouteRejected:
            self._routes.clear_model_route(
                username,
                scope,
                project_dir=project_dir,
                project_state_dir=project_state_dir,
            )
            try:
                return await thread.set_model_route(None, None)
            except SessionModelRouteRejected:
                return None


__all__ = ["HermesSessionModels"]
