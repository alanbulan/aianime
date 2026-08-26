"""Adapters for preparing and scheduling episode sketch grids."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from ai_anime.modules.production.application.generation_context import (
    ProductionGenerationContextUseCases,
)
from ai_anime.modules.production.application.image_settings import (
    ProductionImageSettingsUseCases,
)
from ai_anime.modules.production.application.ports import (
    ProductionRuntimePropMenuSource,
    ProductionSettingsRepository,
    ProductionSketchWorkspace,
)
from ai_anime.modules.production.application.sketch_generation import (
    SKETCH_GENERATION_TASK_TYPE,
    GenerateSketchesCommand,
    PreparedSketchGeneration,
    SketchGenerationRejected,
    SketchGenerationTask,
    SketchGenerationTaskReceipt,
)
from ai_anime.modules.production.domain.sketch_generation import (
    GridShape,
    has_sketch_color_assignments,
    invalid_sketch_grid_error,
    sketch_dispatch_indices,
)
from ai_anime.modules.model_usage.public import (
    resolve_model_route,
)
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.modules.task_execution.public import (
    ProjectTaskSubmission,
    ProjectTaskSubmissionUseCases,
)
from ai_anime.shared.infrastructure import project_stores


class NanoBananaSketchGridPlanner:
    def plan(
        self,
        beats: list[dict[str, Any]],
        *,
        scene_grouping: bool,
        aspect_ratio: str,
    ) -> tuple[GridShape, ...]:
        from ai_anime.modules.production.infrastructure.media_generation.nanobanana_grid import (
            sketch_grid_split,
            sketch_scene_grid_split,
        )

        if scene_grouping:
            scene_plan = sketch_scene_grid_split(
                beats,
                aspect_ratio=aspect_ratio,
            )
            return tuple(
                (int(item["rows"]), int(item["cols"]))
                for item in scene_plan
            )
        return tuple(sketch_grid_split(len(beats)))


class LocalSketchGenerationPreparer:
    def __init__(
        self,
        settings: ProductionSettingsRepository,
        image_settings: ProductionImageSettingsUseCases,
        generation_context_factory: Callable[
            [Any, ProjectContext], ProductionGenerationContextUseCases
        ],
        prop_menu_source: ProductionRuntimePropMenuSource,
        workspace: ProductionSketchWorkspace,
        grid_planner: NanoBananaSketchGridPlanner,
    ) -> None:
        self._settings = settings
        self._image_settings = image_settings
        self._generation_context_factory = generation_context_factory
        self._prop_menu_source = prop_menu_source
        self._workspace = workspace
        self._grid_planner = grid_planner

    async def prepare(
        self,
        context: ProjectContext,
        command: GenerateSketchesCommand,
    ) -> PreparedSketchGeneration:
        project_config = self._settings.load(
            context.owner_username,
            context.project_name,
        )
        style = command.style or project_config.get(
            "visual_style",
            "chinese_period_drama",
        )
        store = await project_stores.make_sqlite_store_for_context(context)
        try:
            beats = await store.get_beats_as_dicts(command.episode_num)
            if not beats:
                raise SketchGenerationRejected(
                    f"No beats found for episode {command.episode_num}"
                )

            grid_plan = self._grid_planner.plan(
                beats,
                scene_grouping=command.sketch_scene_grouping,
                aspect_ratio=command.aspect_ratio,
            )
            grid_error = invalid_sketch_grid_error(
                grid_index=command.grid_index,
                beat_count=len(beats),
                grid_plan=grid_plan,
            )
            if grid_error:
                raise SketchGenerationRejected(grid_error)

            generation_context = self._generation_context_factory(
                store,
                context,
            )
            character_map = await generation_context.build_character_map(
                beats=beats,
                project=context.project_name,
                episode_num=command.episode_num,
                use_detected_identities=False,
            )
            if not has_sketch_color_assignments(character_map):
                raise SketchGenerationRejected(
                    "未检测到颜色分配，请先调用 assign-colors 接口"
                )

            self._workspace.clear_episode_sketches(
                context.output_dir,
                command.episode_num,
            )
            episode = generation_context.episode_or_none(command.episode_num)
            prop_menu = await self._prop_menu_source.for_episode(
                store,
                episode,
                beats,
            )
            image_selection = self._image_settings.resolve_sketch_selection(
                project_config,
                command.image_generation_selection,
            )
            if not image_selection:
                raise SketchGenerationRejected("请先选择草图图片模型")
            image_route = resolve_model_route(image_selection)
            if not image_route.model:
                raise SketchGenerationRejected("草图图片模型路由无效")
            base_config = {
                "beats": beats,
                "character_map": character_map,
                "style": style,
                "model": image_route.model,
                "sketch_scene_grouping": command.sketch_scene_grouping,
                "aspect_ratio": command.aspect_ratio,
                "sketch_colors": (
                    store.get_sketch_colors(command.episode_num) or {}
                ),
                "prop_menu": prop_menu,
            }
            if image_route.selector:
                base_config["model_selector"] = image_route.selector
            tasks = tuple(
                SketchGenerationTask(
                    episode_num=command.episode_num,
                    grid_index=grid_index,
                    output_dir=context.output_dir,
                    config=base_config,
                )
                for grid_index in sketch_dispatch_indices(
                    command.grid_index,
                    len(grid_plan),
                )
            )
            return PreparedSketchGeneration(
                episode_num=command.episode_num,
                requested_grid_index=command.grid_index,
                grid_plan=grid_plan,
                tasks=tasks,
            )
        finally:
            await store.close()


class TaskExecutionSketchGenerationScheduler:
    def __init__(self, submissions: ProjectTaskSubmissionUseCases) -> None:
        self._submissions = submissions

    async def enqueue(
        self,
        context: ProjectContext,
        task: SketchGenerationTask,
    ) -> SketchGenerationTaskReceipt:
        receipt = await self._submissions.submit(
            context,
            ProjectTaskSubmission(
                task_type=SKETCH_GENERATION_TASK_TYPE,
                episode=task.episode_num,
                scope=task.scope,
                payload=task.backend_payload(),
            ),
        )
        return SketchGenerationTaskReceipt(
            grid_index=task.grid_index,
            scope=task.scope,
            task_id=receipt.task_id,
            task_key=receipt.task_key,
            backend=receipt.backend,
            queue=receipt.queue,
        )
