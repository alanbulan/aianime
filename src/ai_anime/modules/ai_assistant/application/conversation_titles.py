"""Generate and persist concise conversation titles."""

from __future__ import annotations

import asyncio
import logging
import re
from pathlib import Path

from ai_anime.modules.ai_assistant.application.ports import (
    ChatHistory,
    ChatTitleGenerator,
)
from ai_anime.modules.ai_assistant.domain import ChatScope


_TITLE_PREFIX = re.compile(r"^(?:标题|会话标题|title)\s*[:：]\s*", re.IGNORECASE)
logger = logging.getLogger(__name__)


def normalize_conversation_title(value: str) -> str:
    title = str(value or "").strip().splitlines()[0].strip()
    title = _TITLE_PREFIX.sub("", title).strip()
    title = title.strip("`*_#[]()（）<>《》\"'“”‘’ ")
    return title[:48].strip()


class ConversationTitles:
    def __init__(
        self,
        history: ChatHistory,
        generator: ChatTitleGenerator,
    ) -> None:
        self._history = history
        self._generator = generator
        self._pending: dict[tuple[str, str, str | None, str], asyncio.Task[None]] = {}

    def schedule(
        self,
        username: str,
        scope: ChatScope,
        first_user_message: str,
        *,
        project_dir: str | Path | None = None,
        project_state_dir: str | Path | None = None,
    ) -> None:
        """Generate a title in the background without delaying the chat turn."""
        key = (username, scope.kind, scope.id, scope.conversation_id)
        pending = self._pending.get(key)
        if pending is not None and not pending.done():
            return

        async def run() -> None:
            try:
                await self.ensure(
                    username,
                    scope,
                    first_user_message,
                    project_dir=project_dir,
                    project_state_dir=project_state_dir,
                )
            except Exception as exc:  # noqa: BLE001 - titles never block a turn
                logger.warning(
                    "failed to generate chat conversation title for user=%s scope=%s: %s",
                    username,
                    scope.to_dict(),
                    exc,
                )

        task = asyncio.create_task(run())
        self._pending[key] = task

        def discard(finished: asyncio.Task[None]) -> None:
            if self._pending.get(key) is finished:
                self._pending.pop(key, None)

        task.add_done_callback(discard)

    async def ensure(
        self,
        username: str,
        scope: ChatScope,
        first_user_message: str,
        *,
        project_dir: str | Path | None = None,
        project_state_dir: str | Path | None = None,
    ) -> str:
        existing = self._history.get_conversation_title(
            username,
            scope,
            project_dir=project_dir,
            project_state_dir=project_state_dir,
        )
        if existing:
            return existing
        generated = normalize_conversation_title(
            await self._generator.generate(first_user_message)
        )
        if not generated:
            return ""
        self._history.set_conversation_title(
            username,
            scope,
            generated,
            project_dir=project_dir,
            project_state_dir=project_state_dir,
        )
        return generated


__all__ = ["ConversationTitles", "normalize_conversation_title"]
