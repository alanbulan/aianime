"""Adapters for global episode video-prompt optimization scheduling."""

from __future__ import annotations

from ai_anime.modules.production.application.global_video_optimization import (
    GLOBAL_VIDEO_OPTIMIZATION_TASK_TYPE,
    GlobalVideoOptimizationMaterials,
    GlobalVideoOptimizationTask,
    GlobalVideoOptimizationTaskReceipt,
)
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.modules.task_execution.public import (
    ProjectTaskSubmission,
    ProjectTaskSubmissionUseCases,
)
from ai_anime.shared.infrastructure import project_stores
from ai_anime.shared.utils.path_resolver import PathResolver


class SqliteGlobalVideoOptimizationSource:
    async def load(
        self,
        context: ProjectContext,
        episode_num: int,
    ) -> GlobalVideoOptimizationMaterials:
        store = await project_stores.make_sqlite_store_for_context(context)
        try:
            beats = await store.get_beats_as_dicts(episode_num)
            if not beats:
                return GlobalVideoOptimizationMaterials(beats=[], characters=[])
            characters = [
                {
                    "name": character.name,
                    "gender": character.gender,
                    "body_type": getattr(character, "body_type", ""),
                    "role": character.role,
                    "is_main": getattr(character, "is_main", False),
                    "face_prompt": character.face_prompt,
                }
                for character in store.get_all_characters()
            ]
            return GlobalVideoOptimizationMaterials(
                beats=beats,
                characters=characters,
            )
        finally:
            await store.close()


class LocalEpisodeSketchCatalog:
    def has_any(self, context: ProjectContext, episode_num: int) -> bool:
        sketches_dir = PathResolver(
            str(context.output_dir),
            episode_num,
        ).sketches_dir()
        return sketches_dir.exists() and any(sketches_dir.glob("beat_*.png"))


class TaskExecutionGlobalVideoOptimizationScheduler:
    def __init__(self, submissions: ProjectTaskSubmissionUseCases) -> None:
        self._submissions = submissions

    async def enqueue(
        self,
        context: ProjectContext,
        task: GlobalVideoOptimizationTask,
    ) -> GlobalVideoOptimizationTaskReceipt:
        receipt = await self._submissions.submit(
            context,
            ProjectTaskSubmission(
                task_type=GLOBAL_VIDEO_OPTIMIZATION_TASK_TYPE,
                episode=task.episode_num,
                payload=task.backend_payload(),
            ),
        )
        return GlobalVideoOptimizationTaskReceipt(
            task_id=receipt.task_id,
            task_key=receipt.task_key,
            backend=receipt.backend,
            queue=receipt.queue,
        )
