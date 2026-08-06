"""Adapters for IndexTTS2 episode audio scheduling."""

from __future__ import annotations

from ai_anime.modules.seedance2_i2v.public import (
    collect_indextts2_voice_prereq_errors,
)
from ai_anime.modules.production.application.episode_audio import (
    INDEXTTS2_AUDIO_TASK_TYPE,
    EpisodeAudioTask,
    EpisodeAudioTaskReceipt,
)
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.modules.task_execution.public import (
    ProjectTaskSubmission,
    ProjectTaskSubmissionUseCases,
)
from ai_anime.shared.infrastructure import project_stores


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


class TaskExecutionEpisodeAudioScheduler:
    def __init__(self, submissions: ProjectTaskSubmissionUseCases) -> None:
        self._submissions = submissions

    async def enqueue(
        self,
        context: ProjectContext,
        task: EpisodeAudioTask,
    ) -> EpisodeAudioTaskReceipt:
        receipt = await self._submissions.submit(
            context,
            ProjectTaskSubmission(
                task_type=INDEXTTS2_AUDIO_TASK_TYPE,
                episode=task.episode_num,
                payload=task.backend_payload(),
            ),
        )
        return EpisodeAudioTaskReceipt(
            task_id=receipt.task_id,
            task_key=receipt.task_key,
            backend=receipt.backend,
            queue=receipt.queue,
        )
