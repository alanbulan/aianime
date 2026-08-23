"""Adapters for missing manual-shot Sketch regeneration."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from ai_anime.modules.narrative_planning.public import (
    choose_manual_sketch_mode_key,
    missing_manual_shot_segments,
    storyboard_beats_for_manual_sketches,
)
from ai_anime.modules.production.application.generation_context import (
    ProductionGenerationContextUseCases,
)
from ai_anime.modules.production.application.image_settings import (
    ProductionImageSettingsUseCases,
)
from ai_anime.modules.production.application.manual_sketch_regeneration import (
    GenerateMissingManualSketchesCommand,
    ManualSketchRegenerationRejected,
    ManualSketchRegenerationSegment,
    PreparedManualSketchRegeneration,
)
from ai_anime.modules.production.application.ports import (
    ProductionSettingsRepository,
)
from ai_anime.modules.production.application.selected_regeneration import (
    SelectedRegenerationKind,
    SelectedRegenerationTask,
)
from ai_anime.modules.model_usage.domain.model_route import (
    resolve_model_route,
)
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.shared.infrastructure import project_stores
from ai_anime.modules.task_execution.public import selection_scope


class LocalManualSketchRegenerationPreparer:
    def __init__(
        self,
        settings: ProductionSettingsRepository,
        image_settings: ProductionImageSettingsUseCases,
        generation_context_factory: Callable[
            [Any, ProjectContext], ProductionGenerationContextUseCases
        ],
    ) -> None:
        self._settings = settings
        self._image_settings = image_settings
        self._generation_context_factory = generation_context_factory

    async def prepare(
        self,
        context: ProjectContext,
        command: GenerateMissingManualSketchesCommand,
    ) -> PreparedManualSketchRegeneration:
        store = await project_stores.make_sqlite_store_for_context(context)
        try:
            beats = await store.get_beats_as_dicts(command.episode_num)
            if not beats:
                raise ManualSketchRegenerationRejected(
                    f"第 {command.episode_num} 集没有 beats"
                )

            storyboard_beats = storyboard_beats_for_manual_sketches(beats)
            sketches_dir = (
                context.output_dir / "sketches" / f"ep{command.episode_num:03d}"
            )
            missing_segments = missing_manual_shot_segments(
                storyboard_beats,
                sketches_dir,
            )
            if not missing_segments:
                return PreparedManualSketchRegeneration(
                    episode_num=command.episode_num,
                    segments=(),
                )

            project_config = self._settings.load(
                context.owner_username,
                context.project_name,
            )
            style = project_config.get(
                "visual_style",
                "chinese_period_drama",
            )
            image_selection = self._image_settings.resolve_sketch_selection(
                project_config
            )
            if not image_selection:
                raise ManualSketchRegenerationRejected("请先选择草图图片模型")
            image_route = resolve_model_route(image_selection)
            if not image_route.model:
                raise ManualSketchRegenerationRejected("草图图片模型路由无效")
            generation_context = self._generation_context_factory(store, context)
            character_map = await generation_context.build_character_map(
                beats=beats,
                project=context.project_name,
                episode_num=command.episode_num,
                use_detected_identities=False,
            )
            sketch_colors = store.get_sketch_colors(command.episode_num) or {}

            segments: list[ManualSketchRegenerationSegment] = []
            for beat_numbers in missing_segments:
                selected_beats = tuple(int(number) for number in beat_numbers)
                mode_key = choose_manual_sketch_mode_key(len(selected_beats))
                task = SelectedRegenerationTask(
                    kind=SelectedRegenerationKind.SKETCH,
                    episode_num=command.episode_num,
                    mode_key=mode_key,
                    scope=selection_scope(mode_key, selected_beats),
                    output_dir=context.output_dir,
                    config={
                        "beats": beats,
                        "character_map": character_map,
                        "style": style,
                        "model": image_route.model,
                        "model_selector": image_route.selector,
                        "selected_beat_numbers": list(selected_beats),
                        "composite_key": f"{mode_key}:sketch",
                        "sketch_colors": sketch_colors,
                    },
                )
                segments.append(
                    ManualSketchRegenerationSegment(
                        beat_numbers=selected_beats,
                        task=task,
                    )
                )
            return PreparedManualSketchRegeneration(
                episode_num=command.episode_num,
                segments=tuple(segments),
            )
        finally:
            await store.close()
