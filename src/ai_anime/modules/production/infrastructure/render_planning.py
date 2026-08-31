"""Adapters for server-authoritative Render planning and execution."""

from __future__ import annotations

import os
from collections.abc import Callable
from pathlib import Path
from typing import Any

from ai_anime.modules.production.infrastructure.media_generation import image_grid
from ai_anime.modules.production.infrastructure.media_generation.render_identity_guard import (
    render_ai_detection_error,
)
from ai_anime.modules.narrative_planning.public import pick_beats_by_number
from ai_anime.modules.production.application.generation_context import (
    ProductionGenerationContextUseCases,
)
from ai_anime.modules.production.application.image_settings import (
    ProductionImageSettingsUseCases,
)
from ai_anime.modules.production.application.ports import (
    ProductionRuntimePropMenuSource,
    ProductionSettingsRepository,
)
from ai_anime.modules.production.application.render_planning import (
    RenderExecutionMaterials,
    RenderPlanGridTask,
    RenderPlanGridTaskReceipt,
    RenderPlanningMaterials,
    RenderPlanRejected,
)
from ai_anime.modules.production.application.selected_regeneration import (
    SELECTED_RENDER_REGEN_TASK_TYPE,
)
from ai_anime.modules.production.domain.render_planning import (
    RenderPlanGrid,
    invalid_render_beat_numbers,
)
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.modules.task_execution.public import (
    ProjectTaskSubmission,
    ProjectTaskSubmissionUseCases,
    selection_scope,
)
from ai_anime.shared.infrastructure import project_stores
from ai_anime.shared.utils.ref_image_hash import RefImageHasher


class EnvironmentRenderPlanAvailability:
    def is_enabled(self) -> bool:
        return os.getenv("DISABLE_RENDER_PLAN_V2") not in {
            "1",
            "true",
            "True",
            "yes",
        }


class LocalRenderPlanningPreparer:
    def __init__(
        self,
        settings: ProductionSettingsRepository,
        image_settings: ProductionImageSettingsUseCases,
        generation_context_factory: Callable[
            [Any, ProjectContext], ProductionGenerationContextUseCases
        ],
        prop_menu_source: ProductionRuntimePropMenuSource,
    ) -> None:
        self._settings = settings
        self._image_settings = image_settings
        self._generation_context_factory = generation_context_factory
        self._prop_menu_source = prop_menu_source

    async def prepare(
        self,
        context: ProjectContext,
        *,
        episode_num: int,
        beat_numbers: tuple[int, ...],
        image_generation_selection: str | None,
    ) -> RenderPlanningMaterials:
        store = await project_stores.make_sqlite_store_for_context(context)
        try:
            all_beats = await store.get_beats_as_dicts(episode_num)
            if not all_beats:
                raise RenderPlanRejected(
                    "no_beats",
                    {"episode": episode_num},
                )

            invalid = invalid_render_beat_numbers(all_beats, beat_numbers)
            if invalid:
                raise RenderPlanRejected(
                    "invalid_beats",
                    {"invalid": list(invalid)},
                )
            selected_beats = pick_beats_by_number(all_beats, beat_numbers)
            detection_error = render_ai_detection_error(selected_beats)
            if detection_error:
                raise RenderPlanRejected(detection_error)

            character_map = await self._generation_context_factory(
                store,
                context,
            ).build_character_map(
                beats=selected_beats,
                project=context.project_name,
                episode_num=episode_num,
                use_detected_identities=True,
            )
            sketch_colors = store.get_sketch_colors(episode_num) or {}
            project_config = self._settings.load(
                context.owner_username,
                context.project_name,
            )
            render_image_selection = self._image_settings.resolve_render_selection(
                project_config,
                image_generation_selection,
            )
            if not render_image_selection:
                raise RenderPlanRejected("image_model_required")
            return RenderPlanningMaterials(
                all_beats=all_beats,
                selected_beats=selected_beats,
                character_map=character_map,
                sketch_colors=sketch_colors,
                style=(
                    project_config.get("visual_style")
                    or "chinese_period_drama"
                ),
                image_generation_selection=render_image_selection,
            )
        finally:
            await store.close()

    async def prepare_execution(
        self,
        context: ProjectContext,
        *,
        episode_num: int,
        all_beats: list[dict[str, Any]],
        sketch_aspect_padding: bool | None,
    ) -> RenderExecutionMaterials:
        project_config = self._settings.load(
            context.owner_username,
            context.project_name,
        )
        store = await project_stores.make_sqlite_store_for_context(context)
        try:
            generation_context = self._generation_context_factory(store, context)
            episode = generation_context.episode_or_none(episode_num)
            prop_menu = await self._prop_menu_source.for_episode(
                store,
                episode,
                all_beats,
            )
            return RenderExecutionMaterials(
                prop_menu=prop_menu,
                sketch_aspect_padding=(
                    self._image_settings.resolve_sketch_aspect_padding(
                        project_config,
                        sketch_aspect_padding,
                    )
                ),
            )
        finally:
            await store.close()


class ImageRenderPlanEngine:
    def build(
        self,
        materials: RenderPlanningMaterials,
        *,
        strategy: str,
        aspect_mode: str,
        force_one_by_one: bool,
    ) -> tuple[RenderPlanGrid, ...]:
        plan = image_grid.build_regen_plan(
            selected_beats=materials.selected_beats,
            strategy=strategy,
            aspect_mode=aspect_mode,
            character_map=materials.character_map,
            force_one_by_one=force_one_by_one,
        )
        return tuple(
            RenderPlanGrid(
                mode_key=entry.mode_key,
                rows=int(entry.rows),
                cols=int(entry.cols),
                beat_numbers=tuple(int(beat) for beat in entry.beat_numbers),
                location=str(entry.location),
                padding_count=int(entry.padding_count),
                reasons=tuple(str(reason) for reason in entry.reasons),
                warnings=tuple(str(warning) for warning in entry.warnings),
            )
            for entry in plan
        )

    def hash(self, plan: tuple[RenderPlanGrid, ...]) -> str:
        return image_grid.hash_plan(list(plan))

    def fingerprint(
        self,
        context: ProjectContext,
        materials: RenderPlanningMaterials,
        *,
        strategy: str,
        aspect_mode: str,
        force_one_by_one: bool,
    ) -> str:
        hasher = RefImageHasher(Path(context.output_dir) / ".render_plan_cache")
        return image_grid.compute_input_fingerprint(
            beats=materials.selected_beats,
            character_map=materials.character_map,
            sketch_colors=materials.sketch_colors,
            strategy=strategy,
            aspect_mode=aspect_mode,
            force_one_by_one=force_one_by_one,
            ref_image_hasher=hasher.hash,
        )


class TaskExecutionRenderPlanScheduler:
    def __init__(self, submissions: ProjectTaskSubmissionUseCases) -> None:
        self._submissions = submissions

    async def enqueue(
        self,
        context: ProjectContext,
        task: RenderPlanGridTask,
    ) -> RenderPlanGridTaskReceipt:
        receipt = await self._submissions.submit(
            context,
            ProjectTaskSubmission(
                task_type=SELECTED_RENDER_REGEN_TASK_TYPE,
                episode=task.episode_num,
                scope=selection_scope(task.grid.mode_key, task.grid.beat_numbers),
                payload=task.backend_payload(),
            ),
        )
        return RenderPlanGridTaskReceipt(
            task_id=receipt.task_id,
        )


ImageRenderPlanEngine = ImageRenderPlanEngine
