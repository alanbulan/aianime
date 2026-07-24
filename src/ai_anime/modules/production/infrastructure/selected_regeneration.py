"""Adapters for selected-Beat Render and Sketch regeneration."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from ai_anime.generators.render_identity_guard import render_ai_detection_error
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
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.shared.infrastructure import project_stores
from ai_anime.task_identity import project_task_state_key, selection_scope


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

            config = {
                "beats": beats,
                "character_map": character_map,
                "style": style,
                "model": command.model,
                "image_generation_selection": image_selection,
                "selected_beat_numbers": list(command.beat_indices),
                "sketch_colors": (
                    store.get_sketch_colors(command.episode_num) or {}
                ),
                "prop_menu": prop_menu,
            }
            if command.kind is SelectedRegenerationKind.RENDER:
                config["sketch_aspect_padding"] = (
                    self._image_settings.resolve_sketch_aspect_padding(
                        project_config,
                        command.sketch_aspect_padding,
                    )
                )

            scope = selection_scope(command.mode_key, command.beat_indices)
            return SelectedRegenerationTask(
                kind=command.kind,
                episode_num=command.episode_num,
                mode_key=command.mode_key,
                scope=scope,
                output_dir=context.output_dir,
                config=config,
            )
        finally:
            await store.close()


class TaskBackendSelectedRegenerationScheduler:
    def __init__(self, task_backend_provider: Callable[[], Any]) -> None:
        self._task_backend_provider = task_backend_provider

    async def enqueue(
        self,
        context: ProjectContext,
        task: SelectedRegenerationTask,
    ) -> SelectedRegenerationTaskReceipt:
        queued = await self._task_backend_provider().enqueue_project_task(
            context,
            task_type=task.task_type,
            queue_kind="default",
            episode=task.episode_num,
            scope=task.scope,
            payload=task.backend_payload(),
        )
        return SelectedRegenerationTaskReceipt(
            task_id=str(queued.task_state.task_id),
            task_key=project_task_state_key(
                task.task_type,
                context.project_id,
                task.episode_num,
                scope=task.scope,
            ),
            backend=queued.backend,
            queue=queued.queue,
        )
