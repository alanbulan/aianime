"""Adapters for episode-audio scheduling."""

from __future__ import annotations

from ai_anime.modules.model_usage.public import resolve_model_for_role
from ai_anime.modules.production.infrastructure.episode_audio_generation import (
    build_episode_audio_generation_plan,
)
from ai_anime.modules.production.application.episode_audio import (
    EPISODE_AUDIO_TASK_TYPE,
    EpisodeAudioGenerationPlan,
    EpisodeAudioTask,
    EpisodeAudioTaskReceipt,
)
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.modules.task_execution.public import (
    ProjectTaskSubmission,
    ProjectTaskSubmissionUseCases,
)
from ai_anime.shared.infrastructure import project_stores

class CatalogEpisodeAudioPlanner:
    async def plan(
        self,
        context: ProjectContext,
        episode_num: int,
        beat_numbers: list[int] | None,
        mode: str,
    ) -> EpisodeAudioGenerationPlan:
        store = await project_stores.make_sqlite_store_for_context(context)
        try:
            plan = await build_episode_audio_generation_plan(
                store=store,
                username=context.owner_username,
                project=context.project_name,
                episode=episode_num,
                beat_numbers=beat_numbers,
                mode=mode,
            )
            errors = list(plan.errors)
            if plan.beat_numbers or plan.errors:
                try:
                    resolve_model_for_role("AUDIO_VOICE_CLONE")
                except PermissionError:
                    errors.append(
                        "AI 配音模型缺失：当前未配置可用的 AUDIO_VOICE_CLONE "
                        "云端或 BYOK 模型"
                    )
            return EpisodeAudioGenerationPlan(
                beat_numbers=tuple(plan.beat_numbers),
                errors=tuple(errors),
                voice_requirements=tuple(plan.voice_requirements),
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
                task_type=EPISODE_AUDIO_TASK_TYPE,
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
