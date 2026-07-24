"""SQLite workspace adapter for project-facing sketch marker use cases."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from ai_anime.modules.production.application.ports import (
    ProductionSketchMarkerStore,
)
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.shared.infrastructure import project_stores


class SqliteProductionSketchMarkerWorkspace:
    @asynccontextmanager
    async def session(
        self,
        context: ProjectContext,
    ) -> AsyncIterator[ProductionSketchMarkerStore]:
        store = await project_stores.make_sqlite_store_for_context(context)
        try:
            yield store
        finally:
            await store.close()


__all__ = ["SqliteProductionSketchMarkerWorkspace"]
