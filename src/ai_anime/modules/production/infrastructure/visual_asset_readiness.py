"""Load and inspect episode visual readiness from the project store."""

from __future__ import annotations

from typing import Any

from ai_anime.modules.production.application.visual_asset_readiness import (
    EpisodeVisualAssetReadiness,
    inspect_episode_visual_assets,
)
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.modules.task_execution.public import (
    effective_task_status,
    project_task_use_cases,
)


async def inspect_project_episode_visual_assets(
    store: Any,
    context: ProjectContext,
    episode_num: int,
    *,
    beats: list[dict[str, Any]] | None = None,
) -> EpisodeVisualAssetReadiness:
    episode = store.get_episode(episode_num)
    if episode is None:
        raise ValueError(f"第 {episode_num} 集不存在")
    characters = list(store.get_all_characters() or [])
    scenes = list(await store.list_scenes() or [])
    props = list(await store.list_props() or [])
    episode_beats = (
        beats if beats is not None else await store.get_beats_as_dicts(episode_num)
    )
    prop_plan_completed = any(
        task.task_type == "episode_prop_planner"
        and task.episode == episode_num
        and effective_task_status(task) == "completed"
        for task in project_task_use_cases().list_for_project(context)
    )
    return inspect_episode_visual_assets(
        project_dir=context.output_dir,
        episode=episode,
        characters=characters,
        scenes=scenes,
        props=props,
        beats=episode_beats,
        prop_plan_completed=prop_plan_completed,
    )
