"""Project assistant reply dispatch orchestration."""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

from ai_anime.modules.ai_assistant.application.deterministic_replies import (
    DeterministicProjectReplies,
)
from ai_anime.modules.ai_assistant.application.hermes_project_replies import (
    HermesProjectReplies,
)
from ai_anime.modules.ai_assistant.application.ports import (
    AgentBackend,
    ChatEventSink,
    ChatRunLocks,
)
from ai_anime.modules.ai_assistant.application.thread_replies import (
    AgentThreadReplies,
)
from ai_anime.modules.ai_assistant.domain import (
    reingest_confirmation_reply,
    script_creation_guidance_prompt,
)


class ProjectAssistantReplies:
    def __init__(
        self,
        backend: AgentBackend,
        thread_replies: AgentThreadReplies,
        run_locks: ChatRunLocks,
        deterministic_replies: DeterministicProjectReplies,
        hermes_replies: HermesProjectReplies,
    ) -> None:
        self._backend = backend
        self._thread_replies = thread_replies
        self._run_locks = run_locks
        self._deterministic_replies = deterministic_replies
        self._hermes_replies = hermes_replies

    async def stream(
        self,
        username: str,
        project: str,
        prompt: str,
        on_event: ChatEventSink,
        *,
        project_dir: str | Path | None = None,
        project_state_dir: str | Path | None = None,
    ) -> dict[str, Any]:
        run_lock_id = self._run_locks.acquire(username, project)
        heartbeat_task = asyncio.create_task(
            self._run_locks.maintain(username, project, run_lock_id)
        )
        try:
            deterministic = reingest_confirmation_reply(prompt)
            if deterministic is not None:
                return await self._deterministic_replies.stream(
                    username,
                    project,
                    deterministic,
                    on_event,
                    project_dir=project_dir,
                    project_state_dir=project_state_dir,
                )
            model_prompt = script_creation_guidance_prompt(prompt) or prompt
            backend = self._backend.name()
            if backend == "codex":
                return await self._thread_replies.stream(
                    "codex",
                    username,
                    project,
                    model_prompt,
                    on_event,
                    project_dir=project_dir,
                    project_state_dir=project_state_dir,
                )
            if backend == "hermes":
                return await self._hermes_replies.stream(
                    username,
                    project,
                    model_prompt,
                    on_event,
                    project_dir=project_dir,
                    project_state_dir=project_state_dir,
                )
            if backend != "claude":
                raise RuntimeError(f"Unsupported chat backend: {backend}")
            return await self._thread_replies.stream(
                "claude",
                username,
                project,
                model_prompt,
                on_event,
                project_dir=project_dir,
                project_state_dir=project_state_dir,
            )
        finally:
            heartbeat_task.cancel()
            try:
                await heartbeat_task
            except asyncio.CancelledError:
                pass
            self._run_locks.release(username, project, run_lock_id)


__all__ = ["ProjectAssistantReplies"]
