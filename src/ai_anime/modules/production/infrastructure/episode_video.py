"""Adapters for episode video composition and final-video discovery."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from ai_anime.modules.production.application.episode_video import (
    EpisodeVideoCompositionTask,
    EpisodeVideoTaskReceipt,
    FinalEpisodeVideoStatus,
)
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.modules.task_execution.public import (
    ProjectTaskSubmission,
    ProjectTaskSubmissionUseCases,
)
from ai_anime.shared import project_media
from ai_anime.shared.infrastructure import project_stores
from ai_anime.shared.utils.path_resolver import PathResolver


class SqliteEpisodeBeatSource:
    async def for_episode(
        self,
        context: ProjectContext,
        episode_num: int,
    ) -> list[dict[str, Any]]:
        store = await project_stores.make_sqlite_store_for_context(context)
        try:
            return await store.get_beats_as_dicts(episode_num)
        finally:
            await store.close()


class TaskExecutionEpisodeVideoScheduler:
    def __init__(self, submissions: ProjectTaskSubmissionUseCases) -> None:
        self._submissions = submissions

    async def enqueue(
        self,
        context: ProjectContext,
        task: EpisodeVideoCompositionTask,
    ) -> EpisodeVideoTaskReceipt:
        receipt = await self._submissions.submit(
            context,
            ProjectTaskSubmission(
                task_type="compose_episode",
                queue_kind="ffmpeg",
                episode=task.episode_num,
                payload=task.backend_payload(),
            ),
        )
        return EpisodeVideoTaskReceipt(
            task_id=receipt.task_id,
            task_key=receipt.task_key,
            backend=receipt.backend,
            queue=receipt.queue,
        )


class LocalFinalEpisodeVideoCatalog:
    def path(
        self,
        context: ProjectContext,
        episode_num: int,
    ) -> Path:
        project_dir = Path(context.output_dir)
        return PathResolver(str(project_dir), episode_num).final_video()

    def status(
        self,
        context: ProjectContext,
        episode_num: int,
    ) -> FinalEpisodeVideoStatus:
        project_dir = Path(context.output_dir)
        final_path = self.path(context, episode_num)
        filename = final_path.name
        relative_path = final_path.relative_to(project_dir).as_posix()
        if not final_path.exists():
            return FinalEpisodeVideoStatus(exists=False, filename=filename)
        return FinalEpisodeVideoStatus(
            exists=True,
            filename=filename,
            video_url=project_media.make_project_static_url(
                context,
                relative_path,
                local_path=final_path,
            ),
        )
