"""Adapters for IndexTTS2 episode audio scheduling."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from ai_anime.audio.indextts2_beat_audio_task import (
    collect_indextts2_voice_prereq_errors,
)
from ai_anime.modules.production.application.episode_audio import (
    INDEXTTS2_AUDIO_TASK_TYPE,
    EpisodeAudioTask,
    EpisodeAudioTaskReceipt,
)
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.shared.infrastructure import project_stores
from ai_anime.task_identity import project_task_state_key


class IndexTTS2VoicePrerequisiteChecker:
    async def check(
        self,
        context: ProjectContext,
        episode_num: int,
        beat_numbers: list[int] | None,
        mode: str,
    ) -> list[str]:
        store = await project_stores.make_sqlite_store_for_context(context)
        try:
            return await collect_indextts2_voice_prereq_errors(
                store=store,
                username=context.owner_username,
                project=context.project_name,
                episode=episode_num,
                beat_numbers=beat_numbers,
                mode=mode,
            )
        finally:
            await store.close()


class TaskBackendEpisodeAudioScheduler:
    def __init__(self, task_backend_provider: Callable[[], Any]) -> None:
        self._task_backend_provider = task_backend_provider

    async def enqueue(
        self,
        context: ProjectContext,
        task: EpisodeAudioTask,
    ) -> EpisodeAudioTaskReceipt:
        queued = await self._task_backend_provider().enqueue_project_task(
            context,
            task_type=INDEXTTS2_AUDIO_TASK_TYPE,
            queue_kind="default",
            episode=task.episode_num,
            payload=task.backend_payload(),
        )
        return EpisodeAudioTaskReceipt(
            task_id=str(queued.task_state.task_id),
            task_key=project_task_state_key(
                INDEXTTS2_AUDIO_TASK_TYPE,
                context.project_id,
                task.episode_num,
            ),
            backend=queued.backend,
            queue=queued.queue,
        )
