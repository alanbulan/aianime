"""Adapters for selected-Beat Render and Sketch regeneration."""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path
from typing import Any

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
from ai_anime.modules.production.application.selected_regeneration import (
    RegenerateSelectedBeatsCommand,
    SelectedRegenerationKind,
    SelectedRegenerationRejected,
    SelectedRegenerationTask,
    SelectedRegenerationTaskReceipt,
)
from ai_anime.modules.production.domain.selected_regeneration import (
    selected_beat_indices_error,
)
from ai_anime.modules.model_usage.public import (
    resolve_model_route,
)
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.shared.infrastructure import project_stores
from ai_anime.modules.task_execution.public import (
    ProjectTaskSubmission,
    ProjectTaskSubmissionUseCases,
    selection_scope,
)


def _single_render_mode_from_sketch(
    output_dir: str | Path,
    episode_num: int,
    beat_indices: tuple[int, ...],
) -> str | None:
    if len(beat_indices) != 1:
        return None
    from PIL import Image

    from ai_anime.shared.utils.path_resolver import PathResolver

    sketch_path = PathResolver(output_dir, episode_num).sketch(beat_indices[0])
    try:
        with Image.open(sketch_path) as image:
            width, height = image.size
    except (OSError, ValueError):
        return None
    if width <= 0 or height <= 0:
        return None
    ratio = width / height
    return (
        "1x1_16-9"
        if abs(ratio - 16 / 9) < abs(ratio - 2 / 3)
        else "1x1_2-3"
    )


class LocalSelectedRegenerationPreparer:
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
        command: RegenerateSelectedBeatsCommand,
    ) -> SelectedRegenerationTask:
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
                raise SelectedRegenerationRejected(
                    f"No beats found for episode {command.episode_num}"
                )

            indices_error = selected_beat_indices_error(
                command.beat_indices,
                len(beats),
            )
            if indices_error:
                raise SelectedRegenerationRejected(indices_error)

            selected_beats = pick_beats_by_number(beats, command.beat_indices)
            if command.kind is SelectedRegenerationKind.RENDER:
                detection_error = render_ai_detection_error(selected_beats)
                if detection_error:
                    raise SelectedRegenerationRejected(detection_error)

            generation_context = self._generation_context_factory(store, context)
            character_map = await generation_context.build_character_map(
                beats=(
                    selected_beats
                    if command.kind is SelectedRegenerationKind.RENDER
                    else beats
                ),
                project=context.project_name,
                episode_num=command.episode_num,
                use_detected_identities=(
                    command.kind is SelectedRegenerationKind.RENDER
                ),
            )
            episode = generation_context.episode_or_none(command.episode_num)
            prop_menu = await self._prop_menu_source.for_episode(
                store,
                episode,
                beats,
            )
            if command.kind is SelectedRegenerationKind.SKETCH:
                image_selection = self._image_settings.resolve_sketch_selection(
                    project_config,
                    command.image_generation_selection,
                )
            else:
                image_selection = self._image_settings.resolve_render_selection(
                    project_config,
                    command.image_generation_selection,
                )
            if not image_selection:
                label = "草图" if command.kind is SelectedRegenerationKind.SKETCH else "渲染"
                raise SelectedRegenerationRejected(f"请先选择{label}图片模型")
            image_route = resolve_model_route(image_selection)
            if not image_route.model:
                raise SelectedRegenerationRejected("图片模型路由无效")

            config = {
                "beats": beats,
                "character_map": character_map,
                "style": style,
                "model": image_route.model,
                "selected_beat_numbers": list(command.beat_indices),
                "sketch_colors": (
                    store.get_sketch_colors(command.episode_num) or {}
                ),
                "prop_menu": prop_menu,
            }
            if image_route.selector:
                config["model_selector"] = image_route.selector
            if command.kind is SelectedRegenerationKind.RENDER:
                config["sketch_aspect_padding"] = (
                    self._image_settings.resolve_sketch_aspect_padding(
                        project_config,
                        command.sketch_aspect_padding,
                    )
                )

            mode_key = command.mode_key
            if command.kind is SelectedRegenerationKind.RENDER:
                mode_key = (
                    _single_render_mode_from_sketch(
                        context.output_dir,
                        command.episode_num,
                        command.beat_indices,
                    )
                    or mode_key
                )
            scope = selection_scope(mode_key, command.beat_indices)
            return SelectedRegenerationTask(
                kind=command.kind,
                episode_num=command.episode_num,
                mode_key=mode_key,
                scope=scope,
                output_dir=context.output_dir,
                config=config,
            )
        finally:
            await store.close()


class TaskExecutionSelectedRegenerationScheduler:
    def __init__(self, submissions: ProjectTaskSubmissionUseCases) -> None:
        self._submissions = submissions

    async def enqueue(
        self,
        context: ProjectContext,
        task: SelectedRegenerationTask,
    ) -> SelectedRegenerationTaskReceipt:
        receipt = await self._submissions.submit(
            context,
            ProjectTaskSubmission(
                task_type=task.task_type,
                episode=task.episode_num,
                scope=task.scope,
                payload=task.backend_payload(),
            ),
        )
        return SelectedRegenerationTaskReceipt(
            task_id=receipt.task_id,
            task_key=receipt.task_key,
            backend=receipt.backend,
            queue=receipt.queue,
        )
