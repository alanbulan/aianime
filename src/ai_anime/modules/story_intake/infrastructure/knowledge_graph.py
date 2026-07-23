"""Cognee adapter for the Story Intake knowledge graph query."""

from __future__ import annotations

from typing import Any


class CogneeKnowledgeGraph:
    def __init__(self, store: Any) -> None:
        self._store = store

    async def get_snapshot(self) -> dict[str, Any]:
        return await self._store.get_graph_snapshot()
