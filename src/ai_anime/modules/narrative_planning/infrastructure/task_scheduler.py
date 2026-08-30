from __future__ import annotations

from ai_anime.modules.narrative_planning.application.task_dto import (
    BeatVideoPromptTask,
    EpisodeRewriteTask,
    EpisodeAssetPlanningTask,
    EpisodeIdentityPlanningTask,
    EpisodePlanningTask,
    ScriptGenerationTask,
    SeedancePromptTask,
    TaskQueueReceipt,
)
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.modules.task_execution.public import (
    ProjectTaskSubmission,
    ProjectTaskSubmissionUseCases,
)


class TaskExecutionScheduler:
    def __init__(self, submissions: ProjectTaskSubmissionUseCases) -> None:
        self._submissions = submissions

    async def enqueue_episode_planning(
        self,
        task_context: ProjectContext,
        task: EpisodePlanningTask,
    ) -> TaskQueueReceipt:
        receipt = await self._submissions.submit(
            task_context,
            ProjectTaskSubmission(
                task_type="build_episodes",
                payload=task.backend_payload(),
            ),
        )
        return TaskQueueReceipt(
            task_id=receipt.task_id,
            task_key=receipt.task_key,
            backend=receipt.backend,
            queue=receipt.queue,
        )

    async def enqueue_script_generation(
        self,
        task_context: ProjectContext,
        task: ScriptGenerationTask,
    ) -> TaskQueueReceipt:
        receipt = await self._submissions.submit(
            task_context,
            ProjectTaskSubmission(
                task_type="script_writer",
                episode=task.episode,
                payload=task.backend_payload(),
            ),
        )
        return TaskQueueReceipt(
            task_id=receipt.task_id,
            task_key=receipt.task_key,
            backend=receipt.backend,
            queue=receipt.queue,
        )

    async def enqueue_beat_video_prompt(
        self,
        task_context: ProjectContext,
        task: BeatVideoPromptTask,
    ) -> TaskQueueReceipt:
        receipt = await self._submissions.submit(
            task_context,
            ProjectTaskSubmission(
                task_type="beat_video_prompt",
                episode=task.episode,
                beat_num=task.beat_num,
                payload=task.backend_payload(),
            ),
        )
        return TaskQueueReceipt(
            task_id=receipt.task_id,
            task_key=receipt.task_key,
            backend=receipt.backend,
            queue=receipt.queue,
        )

    async def enqueue_seedance_prompt(
        self,
        task_context: ProjectContext,
        task: SeedancePromptTask,
    ) -> TaskQueueReceipt:
        receipt = await self._submissions.submit(
            task_context,
            ProjectTaskSubmission(
                task_type="seedance2_prompt",
                episode=task.episode,
                beat_num=task.beat_num,
                payload=task.backend_payload(),
            ),
        )
        return TaskQueueReceipt(
            task_id=receipt.task_id,
            task_key=receipt.task_key,
            backend=receipt.backend,
            queue=receipt.queue,
        )

    async def enqueue_episode_rewrite(
        self,
        task_context: ProjectContext,
        task: EpisodeRewriteTask,
    ) -> TaskQueueReceipt:
        receipt = await self._submissions.submit(
            task_context,
            ProjectTaskSubmission(
                task_type="episode_rewrite",
                episode=task.episode,
                payload=task.backend_payload(),
            ),
        )
        return TaskQueueReceipt(
            task_id=receipt.task_id,
            task_key=receipt.task_key,
            backend=receipt.backend,
            queue=receipt.queue,
        )

    async def enqueue_episode_asset_planning(
        self,
        task_context: ProjectContext,
        task: EpisodeAssetPlanningTask,
    ) -> TaskQueueReceipt:
        receipt = await self._submissions.submit(
            task_context,
            ProjectTaskSubmission(
                task_type=task.task_type,
                episode=task.episode,
                scope=task.scope,
                payload=task.backend_payload(),
            ),
        )
        return TaskQueueReceipt(
            task_id=receipt.task_id,
            task_key=receipt.task_key,
            backend=receipt.backend,
            queue=receipt.queue,
        )

    async def enqueue_episode_identity_planning(
        self,
        task_context: ProjectContext,
        task: EpisodeIdentityPlanningTask,
    ) -> TaskQueueReceipt:
        receipt = await self._submissions.submit(
            task_context,
            ProjectTaskSubmission(
                task_type="identity_planner",
                episode=task.episode,
                payload=task.backend_payload(),
            ),
        )
        return TaskQueueReceipt(
            task_id=receipt.task_id,
            task_key=receipt.task_key,
            backend=receipt.backend,
            queue=receipt.queue,
        )
