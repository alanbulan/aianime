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
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.shared.infrastructure import project_stores
from ai_anime.task_identity import project_task_state_key


class NanoBananaSketchGridPlanner:
    def plan(
        self,
        beats: list[dict[str, Any]],
        *,
        scene_grouping: bool,
        aspect_ratio: str,
    ) -> tuple[GridShape, ...]:
        from ai_anime.generators.nanobanana_grid import (
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
            base_config = {
                "beats": beats,
                "character_map": character_map,
                "style": style,
                "model": command.model,
                "sketch_scene_grouping": command.sketch_scene_grouping,
                "aspect_ratio": command.aspect_ratio,
                "image_generation_selection": image_selection,
                "sketch_colors": (
                    store.get_sketch_colors(command.episode_num) or {}
                ),
                "prop_menu": prop_menu,
            }
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


class TaskBackendSketchGenerationScheduler:
    def __init__(self, task_backend_provider: Callable[[], Any]) -> None:
        self._task_backend_provider = task_backend_provider

    async def enqueue(
        self,
        context: ProjectContext,
        task: SketchGenerationTask,
    ) -> SketchGenerationTaskReceipt:
        queued = await self._task_backend_provider().enqueue_project_task(
            context,
            task_type=SKETCH_GENERATION_TASK_TYPE,
            queue_kind="default",
            episode=task.episode_num,
            scope=task.scope,
            payload=task.backend_payload(),
        )
        return SketchGenerationTaskReceipt(
            grid_index=task.grid_index,
            scope=task.scope,
            task_id=str(queued.task_state.task_id),
            task_key=project_task_state_key(
                SKETCH_GENERATION_TASK_TYPE,
                context.project_id,
                task.episode_num,
                scope=task.scope,
            ),
            backend=queued.backend,
            queue=queued.queue,
        )
