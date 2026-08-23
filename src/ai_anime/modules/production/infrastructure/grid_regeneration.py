"""Adapters for preparing and scheduling single Render-grid regeneration."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from ai_anime.modules.production.infrastructure.media_generation.render_identity_guard import (
    render_ai_detection_error,
)
from ai_anime.modules.narrative_planning.public import pick_beats_by_number
from ai_anime.modules.production.application.generation_context import (
    ProductionGenerationContextUseCases,
)
from ai_anime.modules.production.application.grid_regeneration import (
    GRID_REGENERATION_TASK_TYPE,
    GridRegenerationRejected,
    GridRegenerationTask,
    GridRegenerationTaskReceipt,
    RegenerateGridCommand,
)
from ai_anime.modules.production.application.image_settings import (
    ProductionImageSettingsUseCases,
)
from ai_anime.modules.production.application.ports import (
    ProductionSettingsRepository,
)
from ai_anime.modules.model_usage.domain.model_route import (
    resolve_model_route,
)
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.modules.task_execution.public import (
    ProjectTaskSubmission,
    ProjectTaskSubmissionUseCases,
)
from ai_anime.shared.infrastructure import project_stores


class NanoBananaGridRegenerationPlanner:
    def selected_beat_numbers(
        self,
        beats: list[dict[str, Any]],
        character_map: dict[str, Any],
        *,
        grid_index: int,
        scene_grouping: bool,
        character_grouping: bool,
    ) -> tuple[int, ...]:
        from ai_anime.modules.production.infrastructure.media_generation.nanobanana_grid import (
            REGEN_MODE_CONFIGS,
            character_grid_split,
            perfect_grid_split,
            scene_grid_split,
        )

        if character_grouping:
            plan = character_grid_split(beats, character_map)
            if grid_index < 0 or grid_index >= len(plan):
                labels = " + ".join(
                    f"{entry['rows']}x{entry['cols']}"
                    f"(comp={entry.get('composite_count', '?')})"
                    for entry in plan
                )
                raise GridRegenerationRejected(
                    f"grid_index={grid_index} 超出范围。"
                    f"角色分组方案: {labels}，"
                    f"有效 grid_index: 0~{len(plan) - 1}"
                )
            return tuple(
                int(beat) for beat in plan[grid_index].get("beat_numbers", [])
            )

        if scene_grouping:
            plan = scene_grid_split(beats, character_map=character_map)
            if grid_index < 0 or grid_index >= len(plan):
                labels = " + ".join(
                    f"{entry['rows']}x{entry['cols']}({entry['scene_id']})"
                    for entry in plan
                )
                raise GridRegenerationRejected(
                    f"grid_index={grid_index} 超出范围。"
                    f"场景分组方案: {labels}，"
                    f"有效 grid_index: 0~{len(plan) - 1}"
                )
            return tuple(
                int(beat) for beat in plan[grid_index].get("beat_numbers", [])
            )

        mode_keys = perfect_grid_split(len(beats))
        if grid_index < 0 or grid_index >= len(mode_keys):
            labels = " + ".join(
                f"{REGEN_MODE_CONFIGS[mode_key]['rows']}x"
                f"{REGEN_MODE_CONFIGS[mode_key]['cols']}"
                for mode_key in mode_keys
            )
            raise GridRegenerationRejected(
                f"grid_index={grid_index} 超出范围。"
                f"共 {len(beats)} 个 beats，分割方案: {labels}，"
                f"有效 grid_index: 0~{len(mode_keys) - 1}"
            )
        start_offset = sum(
            int(REGEN_MODE_CONFIGS[mode_key]["capacity"])
            for mode_key in mode_keys[:grid_index]
        )
        capacity = int(REGEN_MODE_CONFIGS[mode_keys[grid_index]]["capacity"])
        return tuple(
            int(beat.get("beat_number", index + 1))
            for index, beat in enumerate(
                beats[start_offset : start_offset + capacity],
                start_offset,
            )
        )


class LocalGridRegenerationPreparer:
    def __init__(
        self,
        settings: ProductionSettingsRepository,
        image_settings: ProductionImageSettingsUseCases,
        generation_context_factory: Callable[
            [Any, ProjectContext], ProductionGenerationContextUseCases
        ],
        planner: NanoBananaGridRegenerationPlanner,
    ) -> None:
        self._settings = settings
        self._image_settings = image_settings
        self._generation_context_factory = generation_context_factory
        self._planner = planner

    async def prepare(
        self,
        context: ProjectContext,
        command: RegenerateGridCommand,
    ) -> GridRegenerationTask:
        project_config = self._settings.load(
            context.owner_username,
            context.project_name,
        )
        style = command.style or project_config.get(
            "visual_style",
            "chinese_period_drama",
        )
        image_selection = self._image_settings.resolve_render_selection(
            project_config,
            command.image_generation_selection,
        )
        if not image_selection:
            raise GridRegenerationRejected("请先选择渲染图片模型")
        image_route = resolve_model_route(image_selection)
        if not image_route.model:
            raise GridRegenerationRejected("渲染图片模型路由无效")
        store = await project_stores.make_sqlite_store_for_context(context)
        try:
            beats = await store.get_beats_as_dicts(command.episode_num)
            if not beats:
                raise GridRegenerationRejected(
                    f"No beats found for episode {command.episode_num}"
                )

            generation_context = self._generation_context_factory(store, context)
            character_map = await generation_context.build_character_map(
                beats=beats,
                project=context.project_name,
                episode_num=command.episode_num,
                use_detected_identities=True,
            )
            selected_beat_numbers = self._planner.selected_beat_numbers(
                beats,
                character_map,
                grid_index=command.grid_index,
                scene_grouping=command.scene_grouping,
                character_grouping=command.character_grouping,
            )
            selected_beats = pick_beats_by_number(beats, selected_beat_numbers)
            detection_error = render_ai_detection_error(selected_beats)
            if detection_error:
                raise GridRegenerationRejected(detection_error)

            return GridRegenerationTask(
                episode_num=command.episode_num,
                grid_index=command.grid_index,
                output_dir=context.output_dir,
                config={
                    "beats": beats,
                    "character_map": character_map,
                    "style": style,
                    "model": image_route.model,
                    "model_selector": image_route.selector,
                    "render_mode": "Render",
                    "scene_grouping": command.scene_grouping,
                    "character_grouping": command.character_grouping,
                    "sketch_aspect_padding": (
                        self._image_settings.resolve_sketch_aspect_padding(
                            project_config,
                            command.sketch_aspect_padding,
                        )
                    ),
                },
            )
        finally:
            await store.close()


class TaskExecutionGridRegenerationScheduler:
    def __init__(self, submissions: ProjectTaskSubmissionUseCases) -> None:
        self._submissions = submissions

    async def enqueue(
        self,
        context: ProjectContext,
        task: GridRegenerationTask,
    ) -> GridRegenerationTaskReceipt:
        receipt = await self._submissions.submit(
            context,
            ProjectTaskSubmission(
                task_type=GRID_REGENERATION_TASK_TYPE,
                episode=task.episode_num,
                scope=task.scope,
                payload=task.backend_payload(),
            ),
        )
        return GridRegenerationTaskReceipt(
            scope=task.scope,
            task_id=receipt.task_id,
            task_key=receipt.task_key,
            backend=receipt.backend,
            queue=receipt.queue,
        )
