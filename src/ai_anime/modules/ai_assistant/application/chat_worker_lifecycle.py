"""Chat worker lifecycle orchestration."""

from ai_anime.modules.ai_assistant.application.ports import (
    ChatRunLocks,
    HermesRuntime,
)
from ai_anime.modules.ai_assistant.domain import ChatScope


class ChatWorkerLifecycle:
    def __init__(self, runtime: HermesRuntime, run_locks: ChatRunLocks) -> None:
        self._runtime = runtime
        self._run_locks = run_locks

    async def cancel(self, username: str) -> bool:
        try:
            cancelled = await self._runtime.close_user(username)
        except Exception:
            cancelled = False
        try:
            self._run_locks.force_release(username, "")
        except Exception:
            pass
        return cancelled

    async def sync_scope(self, username: str, scope: ChatScope) -> None:
        try:
            await self._runtime.set_scope_for_user(
                username,
                scope_kind=scope.kind,
                project_id=scope.id if scope.kind == "project" else None,
                conversation_id=scope.conversation_id,
            )
        except Exception:
            return

    async def forget_conversation(
        self,
        username: str,
        scope: ChatScope,
    ) -> bool:
        try:
            return await self._runtime.forget_conversation(
                username,
                scope_kind=scope.kind,
                project_id=scope.id if scope.kind == "project" else None,
                conversation_id=scope.conversation_id,
            )
        except Exception:
            return False

    def is_busy(self, username: str) -> bool:
        return self._run_locks.is_active(username)


__all__ = ["ChatWorkerLifecycle"]
