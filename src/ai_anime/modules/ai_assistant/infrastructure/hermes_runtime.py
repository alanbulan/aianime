"""Hermes worker-pool runtime adapter."""

from __future__ import annotations

from typing import Any

from ai_anime.modules.ai_assistant.application.ports import HermesThread


class LocalHermesRuntime:
    def __init__(self, pool: Any | None = None) -> None:
        if pool is None:
            from ai_anime.modules.ai_assistant.infrastructure.hermes.hermes_pool import pool as process_pool

            pool = process_pool
        self._pool = pool

    async def get_for_user(
        self,
        username: str,
        *,
        scope_kind: str,
        project_id: str | None,
        conversation_id: str = "main",
    ) -> HermesThread:
        return await self._pool.get_for_user(
            username,
            scope_kind=scope_kind,
            project_id=project_id,
            conversation_id=conversation_id,
        )

    async def prewarm(
        self,
        username: str,
        *,
        scope_kind: str,
        project_id: str | None,
        conversation_id: str = "main",
    ) -> None:
        await self._pool.prewarm(
            username,
            scope_kind=scope_kind,
            project_id=project_id,
            conversation_id=conversation_id,
        )

    async def set_scope_for_user(
        self,
        username: str,
        *,
        scope_kind: str,
        project_id: str | None,
        conversation_id: str = "main",
    ) -> bool:
        return await self._pool.set_scope_for_user(
            username,
            scope_kind=scope_kind,
            project_id=project_id,
            conversation_id=conversation_id,
        )

    async def close_user(self, username: str) -> bool:
        return await self._pool.close_user(username)

    async def forget_conversation(
        self,
        username: str,
        *,
        scope_kind: str,
        project_id: str | None,
        conversation_id: str,
    ) -> bool:
        return await self._pool.forget_conversation(
            username,
            scope_kind=scope_kind,
            project_id=project_id,
            conversation_id=conversation_id,
        )
