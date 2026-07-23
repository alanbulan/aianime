from __future__ import annotations

from pathlib import Path

from ai_anime.modules.narrative_planning.application.ports import (
    NarrativeTaskScheduler,
    ScriptGenerationStore,
    SketchWorkspace,
)
from ai_anime.modules.narrative_planning.application.task_dto import (
    BeatVideoPromptTask,
    EpisodePlanningTask,
    ScheduledNarrativeTask,
    ScriptGenerationTask,
)
from ai_anime.modules.project_workspace.public import ProjectContext


class IdentityPlanRequired(ValueError):
    code = "identity_plan_required"

    def __init__(self, episode_num: int) -> None:
        super().__init__(f"第 {episode_num} 集尚未规划角色身份，请先规划身份")


class ProjectContextRequired(ValueError):
    pass


class ScheduleEpisodePlanning:
    def __init__(self, task_scheduler: NarrativeTaskScheduler) -> None:
        self._task_scheduler = task_scheduler

    async def execute(
        self,
        *,
        task_context: ProjectContext | None,
        target_episodes: int,
        planning_mode: str,
        output_dir: str | Path,
        state_dir: str | Path,
    ) -> ScheduledNarrativeTask:
        if task_context is None:
            raise ProjectContextRequired("分集规划需要 project context")

        receipt = await self._task_scheduler.enqueue_episode_planning(
            task_context,
            EpisodePlanningTask(
                target_episodes=target_episodes,
                planning_mode=planning_mode,
                output_dir=output_dir,
                state_dir=state_dir,
            ),
        )
        return ScheduledNarrativeTask.from_receipt(
            receipt,
            task_type="build_episodes",
            message=f"分集规划任务已进入队列 (目标 {target_episodes} 集)",
        )


class StartScriptGeneration:
    def __init__(
        self,
        *,
        task_scheduler: NarrativeTaskScheduler,
        sketch_workspace: SketchWorkspace,
    ) -> None:
        self._task_scheduler = task_scheduler
        self._sketch_workspace = sketch_workspace

    async def execute(
        self,
        store: ScriptGenerationStore,
        *,
        task_context: ProjectContext | None,
        output_dir: str | Path,
        episode_num: int,
    ) -> ScheduledNarrativeTask:
        episode = store.get_episode(episode_num)
        if not getattr(episode, "identity_ids", None):
            raise IdentityPlanRequired(episode_num)

        self._sketch_workspace.clear_episode_sketches(output_dir, episode_num)
        if task_context is None:
            raise ProjectContextRequired("剧本生成需要 project context")

        receipt = await self._task_scheduler.enqueue_script_generation(
            task_context,
            ScriptGenerationTask(
                episode=episode_num,
                output_dir=output_dir,
            ),
        )
        return ScheduledNarrativeTask.from_receipt(
            receipt,
            task_type="script_writer",
            message=f"第 {episode_num} 集剧本生成任务已进入队列",
        )


class ScheduleBeatVideoPrompt:
    def __init__(self, task_scheduler: NarrativeTaskScheduler) -> None:
        self._task_scheduler = task_scheduler

    async def execute(
        self,
        task_context: ProjectContext,
        task: BeatVideoPromptTask,
    ) -> ScheduledNarrativeTask:
        receipt = await self._task_scheduler.enqueue_beat_video_prompt(
            task_context,
            task,
        )
        return ScheduledNarrativeTask.from_receipt(
            receipt,
            task_type="beat_video_prompt",
            message=(
                f"第 {task.episode} 集 Beat {task.beat_num} 提示词生成已入队"
            ),
        )
