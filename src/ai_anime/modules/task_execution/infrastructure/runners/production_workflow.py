"""Runner for the canonical story-to-final-video production workflow."""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ai_anime.modules.narrative_planning.public import (
    ScriptWorkflowExecutor,
    ScriptWorkflowOptions,
    start_episode_asset_planning,
    update_episode_script_beat,
)
from ai_anime.modules.project_workspace.public import (
    ProjectContext,
    load_project_config,
)
from ai_anime.modules.task_execution.infrastructure.runners.script_workflow import (
    ProjectScriptWorkflowRuntime,
)
from ai_anime.modules.task_execution.infrastructure.task_state import get_task_manager
from ai_anime.modules.task_execution.public import (
    ProjectTaskRef,
    await_envelope_with_cancel_watch,
    effective_task_status,
    parse_task_timestamp,
    project_task_use_cases,
    register_project_task_runner,
)
from ai_anime.shared.infrastructure.project_stores import (
    make_sqlite_store_for_context,
)
from ai_anime.shared.utils.path_resolver import (
    PathResolver,
    canonical_identity_path,
    canonical_portrait_path,
    canonical_prop_reference_path,
    canonical_scene_master_path,
    canonical_scene_reverse_master_path,
)

PRODUCTION_WORKFLOW_TASK_TYPE = "production_workflow"

logger = logging.getLogger(__name__)


class ProductionWorkflowModelPrerequisitesMissing(RuntimeError):
    code = "model_prereq_required"
    action_required = True

    def __init__(self, errors: list[str]) -> None:
        self.errors = tuple(errors)
        super().__init__("；".join(errors))


def _resolve_production_image_models() -> tuple[str, str]:
    from ai_anime.modules.model_usage.public import resolve_model_for_role

    resolved: dict[str, str] = {}
    errors: list[str] = []
    for role, label in (
        ("IMAGE_GENERATION", "文生图"),
        ("IMAGE_EDIT", "参考图编辑"),
    ):
        try:
            resolved[role] = resolve_model_for_role(role)
        except PermissionError:
            errors.append(f"{label}模型缺失：当前未配置可用的 {role} 云端或 BYOK 模型")
    if errors:
        raise ProductionWorkflowModelPrerequisitesMissing(errors)
    return resolved["IMAGE_GENERATION"], resolved["IMAGE_EDIT"]


_FAILED_STATUSES = frozenset({"failed", "cancelled", "canceled"})
_TASK_NOT_FOUND_GRACE_SECONDS = 10.0


@dataclass(frozen=True)
class _ChildTicket:
    task_type: str
    task_id: str
    label: str
    episode: int = 0
    beat_num: int | None = None
    scope: str | None = None


@dataclass(frozen=True)
class _Job:
    label: str
    episode: int
    start: Callable[[], Awaitable[Any]]
    beat_num: int | None = None


class _ProgressReporter:
    def __init__(self, context: ProjectContext, envelope: dict[str, Any]) -> None:
        self._context = context
        self._scope = str(envelope.get("scope") or "") or None
        self._task_id = str(envelope.get("__run_task_id") or "") or None
        self._progress = 0.0
        self._last_message = ""

    def update(self, progress: float, message: str) -> None:
        normalized_progress = min(0.99, max(self._progress, float(progress)))
        normalized_message = str(message or "").strip()
        if (
            normalized_progress == self._progress
            and normalized_message == self._last_message
        ):
            return
        self._progress = normalized_progress
        self._last_message = normalized_message
        get_task_manager().update_progress_for_project(
            self._context,
            PRODUCTION_WORKFLOW_TASK_TYPE,
            0,
            scope=self._scope,
            progress=self._progress,
            current_task=normalized_message,
            logs=[normalized_message] if normalized_message else None,
            expected_task_id=self._task_id,
        )


def _as_mapping(scheduled: Any) -> dict[str, Any]:
    if isinstance(scheduled, dict):
        return dict(scheduled)
    as_dict = getattr(scheduled, "as_dict", None)
    if callable(as_dict):
        value = as_dict()
        if isinstance(value, dict):
            return dict(value)
    return {
        key: getattr(scheduled, key)
        for key in ("task_type", "task_id", "task_key", "scope")
        if getattr(scheduled, key, None) is not None
    }


def _ticket_from_scheduled(
    scheduled: Any,
    *,
    label: str,
    episode: int,
    beat_num: int | None = None,
    task_type: str | None = None,
) -> _ChildTicket:
    data = _as_mapping(scheduled)
    resolved_task_type = str(task_type or data.get("task_type") or "").strip()
    task_id = str(data.get("task_id") or "").strip()
    if not resolved_task_type or not task_id:
        raise RuntimeError(f"{label}没有返回完整任务标识")
    return _ChildTicket(
        task_type=resolved_task_type,
        task_id=task_id,
        label=label,
        episode=episode,
        beat_num=beat_num,
        scope=str(data.get("scope") or "").strip() or None,
    )


def _task_for_ticket(
    context: ProjectContext,
    ticket: _ChildTicket,
) -> Any | None:
    task = project_task_use_cases().get_for_project(
        context,
        ProjectTaskRef(
            task_type=ticket.task_type,
            episode=ticket.episode,
            beat_num=ticket.beat_num,
            scope=ticket.scope,
        ),
    )
    if task is None or task.task_id != ticket.task_id:
        return None
    return task


async def _wait_ticket(
    context: ProjectContext,
    ticket: _ChildTicket,
    *,
    timeout_seconds: float,
) -> dict[str, Any]:
    started = time.monotonic()
    missing_since: float | None = None
    while True:
        task = _task_for_ticket(context, ticket)
        now = time.monotonic()
        if task is None:
            missing_since = missing_since or now
            if now - missing_since >= _TASK_NOT_FOUND_GRACE_SECONDS:
                raise RuntimeError(f"任务中心未找到{ticket.label}（{ticket.task_id}）")
        else:
            missing_since = None
            status = effective_task_status(task)
            if status == "completed":
                return dict(task.result or {})
            if status in _FAILED_STATUSES:
                detail = str(task.error or task.current_task or status).strip()
                raise RuntimeError(f"{ticket.label}执行失败：{detail}")
        if now - started >= timeout_seconds:
            raise TimeoutError(f"等待{ticket.label}超时（{int(timeout_seconds)} 秒）")
        await asyncio.sleep(0.5)


def _parent_task_id(task: Any) -> str:
    raw_metadata = getattr(task, "metadata", None)
    metadata = raw_metadata if isinstance(raw_metadata, dict) else {}
    result = getattr(task, "result", None)
    if not metadata and isinstance(result, dict):
        nested = result.get("task_metadata")
        metadata = nested if isinstance(nested, dict) else {}
    return str(metadata.get("parent_task_id") or "").strip()


async def _cancel_owned_child_tasks(
    context: ProjectContext,
    parent_task_id: str,
) -> None:
    """Cancel active descendants created by this workflow, not shared tasks."""

    tasks = project_task_use_cases().list_for_project(context)
    owned_ids = {str(parent_task_id or "").strip()}
    descendants: list[Any] = []
    remaining = list(tasks)
    while owned_ids:
        discovered: set[str] = set()
        next_remaining: list[Any] = []
        for task in remaining:
            if _parent_task_id(task) not in owned_ids:
                next_remaining.append(task)
                continue
            descendants.append(task)
            discovered.add(str(task.task_id))
        if not discovered:
            break
        owned_ids = discovered
        remaining = next_remaining

    use_cases = project_task_use_cases()
    for task in reversed(descendants):
        if effective_task_status(task) not in {"submitting", "queued", "running"}:
            continue
        try:
            await use_cases.cancel(
                context,
                ProjectTaskRef(
                    task_type=task.task_type,
                    episode=task.episode,
                    beat_num=task.beat_num,
                    scope=task.scope,
                ),
            )
        except Exception:
            logger.exception(
                "Failed to cancel production child task %s",
                task.task_id,
            )


async def _run_jobs(
    context: ProjectContext,
    jobs: list[_Job],
    *,
    max_parallel: int,
    timeout_seconds: float,
    reporter: _ProgressReporter,
    progress: float,
) -> None:
    for offset in range(0, len(jobs), max_parallel):
        batch = jobs[offset : offset + max_parallel]
        reporter.update(progress, "、".join(job.label for job in batch))
        scheduled = await asyncio.gather(*(job.start() for job in batch))
        tickets = [
            _ticket_from_scheduled(
                item,
                label=job.label,
                episode=job.episode,
                beat_num=job.beat_num,
            )
            for job, item in zip(batch, scheduled, strict=True)
        ]
        await asyncio.gather(
            *(
                _wait_ticket(
                    context,
                    ticket,
                    timeout_seconds=timeout_seconds,
                )
                for ticket in tickets
            )
        )


async def _load_story_state(
    context: ProjectContext,
) -> tuple[list[Any], list[Any]]:
    store = await make_sqlite_store_for_context(context)
    try:
        return (
            list(store.get_all_characters() or []),
            list(store.get_all_episodes() or []),
        )
    finally:
        await store.close()


async def _episode_beats(
    context: ProjectContext,
    episode_num: int,
) -> list[dict[str, Any]]:
    store = await make_sqlite_store_for_context(context)
    try:
        return list(await store.get_beats_as_dicts(episode_num) or [])
    finally:
        await store.close()


async def _reconcile_episode_identity_markers(
    context: ProjectContext,
    episode_num: int,
) -> int:
    """Repair legacy bare character names through the script document use case."""

    from ai_anime.modules.production.public import (
        build_episode_identity_alias_map,
        canonicalize_visual_identity_markers,
        complete_detected_refs_from_visual_description,
    )

    store = await make_sqlite_store_for_context(context)
    try:
        episode = store.get_episode(episode_num)
        if episode is None:
            raise RuntimeError(f"第 {episode_num} 集不存在")
        characters = list(store.get_all_characters() or [])
        aliases = build_episode_identity_alias_map(episode, characters)
        allowed_identity_ids = {
            str(identity_id or "").strip()
            for identity_id in (getattr(episode, "identity_ids", None) or [])
            if str(identity_id or "").strip()
        }
        allowed_prop_ids = {
            str(getattr(prop, "prop_id", "") or "").strip()
            for prop in (getattr(episode, "prop_menu", None) or [])
            if str(getattr(prop, "prop_id", "") or "").strip()
        }
        beats = list(await store.get_beats_as_dicts(episode_num) or [])
        changed = 0
        for beat in beats:
            beat_num = int(beat.get("beat_number") or 0)
            if beat_num <= 0:
                continue
            visual_description = str(beat.get("visual_description") or "")
            canonical_description = canonicalize_visual_identity_markers(
                visual_description,
                aliases,
            )
            detected_identities, detected_props = (
                complete_detected_refs_from_visual_description(
                    visual_description=canonical_description,
                    detected_identities=beat.get("detected_identities"),
                    detected_props=beat.get("detected_props"),
                    allowed_identity_ids=allowed_identity_ids,
                    allowed_prop_ids=allowed_prop_ids,
                )
            )
            updates: dict[str, Any] = {}
            if canonical_description != visual_description:
                updates["visual_description"] = canonical_description
            if detected_identities != beat.get("detected_identities"):
                updates["detected_identities"] = detected_identities
            if detected_props != beat.get("detected_props"):
                updates["detected_props"] = detected_props
            if not updates:
                continue
            await update_episode_script_beat(
                store,
                episode_num=episode_num,
                beat_num=beat_num,
                updates=updates,
            )
            changed += 1
        return changed
    finally:
        await store.close()


def _beat_numbers(beats: list[dict[str, Any]]) -> list[int]:
    return [
        int(beat.get("beat_number") or 0)
        for beat in beats
        if int(beat.get("beat_number") or 0) > 0
    ]


def _latest_completed_task(
    context: ProjectContext,
    task_type: str,
    episode: int,
) -> Any | None:
    return next(
        (
            task
            for task in project_task_use_cases().list_for_project(context)
            if task.task_type == task_type
            and task.episode == episode
            and effective_task_status(task) == "completed"
        ),
        None,
    )


def _completed_after_files(task: Any | None, paths: list[Path]) -> bool:
    if task is None or not paths or not all(path.exists() for path in paths):
        return False
    completed_at = parse_task_timestamp(task.completed_at or task.updated_at or "")
    if completed_at is None:
        return False
    return completed_at.timestamp() >= max(path.stat().st_mtime for path in paths)


def _require_generated_files(label: str, paths: list[Path]) -> None:
    missing = [str(path) for path in paths if not path.exists()]
    if missing:
        raise RuntimeError(f"{label}任务已完成但产物不完整：" + "、".join(missing))


async def _plan_missing_props(
    context: ProjectContext,
    episode_numbers: tuple[int, ...],
    *,
    timeout_seconds: float,
    max_parallel: int,
    reporter: _ProgressReporter,
) -> None:
    _characters, episodes = await _load_story_state(context)
    by_number = {
        int(getattr(episode, "number", 0) or 0): episode for episode in episodes
    }
    jobs: list[_Job] = []
    for episode_num in episode_numbers:
        episode = by_number.get(episode_num)
        if episode is None:
            raise RuntimeError(f"第 {episode_num} 集不存在")
        if getattr(episode, "prop_menu", None) or _latest_completed_task(
            context,
            "episode_prop_planner",
            episode_num,
        ):
            continue

        async def start(ep: int = episode_num) -> Any:
            return await start_episode_asset_planning(
                context,
                episode_num=ep,
                asset_kind="prop",
            )

        jobs.append(_Job(f"第 {episode_num} 集规划道具", episode_num, start))
    await _run_jobs(
        context,
        jobs,
        max_parallel=max_parallel,
        timeout_seconds=timeout_seconds,
        reporter=reporter,
        progress=0.29,
    )


async def _generate_missing_world_assets(
    context: ProjectContext,
    episode_numbers: tuple[int, ...],
    *,
    image_generation_model: str,
    image_edit_model: str,
    timeout_seconds: float,
    max_parallel: int,
    reporter: _ProgressReporter,
) -> None:
    from ai_anime.modules.asset_world.public import (
        character_task_use_cases,
        image_settings_use_cases,
        prop_task_use_cases,
        scene_task_use_cases,
    )

    characters, episodes = await _load_story_state(context)
    selected = {
        int(getattr(episode, "number", 0) or 0): episode
        for episode in episodes
        if int(getattr(episode, "number", 0) or 0) in episode_numbers
    }
    active_identity_ids = {
        str(identity_id or "").strip()
        for episode in selected.values()
        for identity_id in (getattr(episode, "identity_ids", None) or [])
        if str(identity_id or "").strip()
    }
    active_characters: list[Any] = []
    active_identities: list[tuple[Any, Any]] = []
    for character in characters:
        identities = [
            identity
            for identity in (getattr(character, "identities", None) or [])
            if str(getattr(identity, "identity_id", "") or "").strip()
            in active_identity_ids
        ]
        if identities:
            active_characters.append(character)
            active_identities.extend((character, identity) for identity in identities)
    resolved_identity_ids = {
        str(getattr(identity, "identity_id", "") or "").strip()
        for _character, identity in active_identities
    }
    unresolved_identity_ids = sorted(active_identity_ids - resolved_identity_ids)
    if unresolved_identity_ids:
        raise RuntimeError(
            "分集身份规划引用了不存在的身份：" + "、".join(unresolved_identity_ids)
        )

    image_settings = image_settings_use_cases()
    portrait_jobs: list[_Job] = []
    missing_portraits = [
        character
        for character in active_characters
        if not canonical_portrait_path(
            context.output_dir,
            str(getattr(character, "name", "") or ""),
        ).exists()
    ]
    if missing_portraits:
        options = image_settings.character_generation_options(
            context.owner_username,
            context.project_name,
            requested_style=None,
            requested_model=image_generation_model,
        )
        for character in missing_portraits:
            character_name = str(getattr(character, "name", "") or "")

            async def start(
                name: str = character_name,
                style: str = str(options.style or ""),
                model: str = options.model,
                model_selector: str = options.model_selector,
            ) -> Any:
                return await character_task_use_cases().schedule_character_portrait(
                    task_context=context,
                    project_dir=context.output_dir,
                    character_name=name,
                    style=style,
                    model=model,
                    model_selector=model_selector,
                )

            portrait_jobs.append(_Job(f"生成角色肖像：{character_name}", 0, start))
    await _run_jobs(
        context,
        portrait_jobs,
        max_parallel=max_parallel,
        timeout_seconds=timeout_seconds,
        reporter=reporter,
        progress=0.32,
    )
    _require_generated_files(
        "角色肖像生成",
        [
            canonical_portrait_path(
                context.output_dir,
                str(getattr(character, "name", "") or ""),
            )
            for character in missing_portraits
        ],
    )

    identity_jobs: list[_Job] = []
    missing_identities = [
        (character, identity)
        for character, identity in active_identities
        if not canonical_identity_path(
            context.output_dir,
            str(getattr(character, "name", "") or ""),
            str(
                getattr(identity, "identity_name", "")
                or getattr(identity, "identity_id", "")
                or ""
            ),
        ).exists()
    ]
    if missing_identities:
        options = image_settings.character_generation_options(
            context.owner_username,
            context.project_name,
            requested_style=None,
            requested_model=image_edit_model,
        )
        for character, identity in missing_identities:
            character_name = str(getattr(character, "name", "") or "")
            identity_id = str(getattr(identity, "identity_id", "") or "")

            async def start(
                name: str = character_name,
                ident: str = identity_id,
                style: str = str(options.style or ""),
                model: str = options.model,
                model_selector: str = options.model_selector,
            ) -> Any:
                store = await make_sqlite_store_for_context(context)
                try:
                    return await character_task_use_cases().schedule_identity_image(
                        repository=store,
                        task_context=context,
                        project_dir=context.output_dir,
                        character_name=name,
                        identity_id=ident,
                        style=style,
                        model=model,
                        model_selector=model_selector,
                    )
                finally:
                    await store.close()

            identity_jobs.append(_Job(f"生成身份图：{identity_id}", 0, start))
    await _run_jobs(
        context,
        identity_jobs,
        max_parallel=max_parallel,
        timeout_seconds=timeout_seconds,
        reporter=reporter,
        progress=0.35,
    )
    _require_generated_files(
        "身份图生成",
        [
            canonical_identity_path(
                context.output_dir,
                str(getattr(character, "name", "") or ""),
                str(
                    getattr(identity, "identity_name", "")
                    or getattr(identity, "identity_id", "")
                    or ""
                ),
            )
            for character, identity in missing_identities
        ],
    )

    scene_ids = tuple(
        dict.fromkeys(
            str(getattr(item, "scene_id", "") or "").strip()
            for episode in selected.values()
            for item in (getattr(episode, "scene_menu", None) or [])
            if str(getattr(item, "scene_id", "") or "").strip()
        )
    )
    scene_style = image_settings.project_style(
        context.owner_username,
        context.project_name,
    )

    def scene_job(scene_name: str, kind: str) -> _Job:
        async def start() -> Any:
            store = await make_sqlite_store_for_context(context)
            try:
                return await scene_task_use_cases().schedule_reference(
                    repository=store,
                    task_context=context,
                    output_dir=context.output_dir,
                    scene_name=scene_name,
                    kind=kind,
                    style=scene_style,
                    model=(
                        image_generation_model if kind == "master" else image_edit_model
                    ),
                )
            finally:
                await store.close()

        label = "正向参考图" if kind == "master" else "反向参考图"
        return _Job(f"生成场景{label}：{scene_name}", 0, start)

    master_jobs = [
        scene_job(scene_id, "master")
        for scene_id in scene_ids
        if not canonical_scene_master_path(context.output_dir, scene_id).exists()
    ]
    await _run_jobs(
        context,
        master_jobs,
        max_parallel=max_parallel,
        timeout_seconds=timeout_seconds,
        reporter=reporter,
        progress=0.38,
    )
    _require_generated_files(
        "场景正向参考图生成",
        [canonical_scene_master_path(context.output_dir, item) for item in scene_ids],
    )
    reverse_jobs = [
        scene_job(scene_id, "reverse_master")
        for scene_id in scene_ids
        if not canonical_scene_reverse_master_path(
            context.output_dir,
            scene_id,
        ).exists()
    ]
    await _run_jobs(
        context,
        reverse_jobs,
        max_parallel=max_parallel,
        timeout_seconds=timeout_seconds,
        reporter=reporter,
        progress=0.40,
    )
    _require_generated_files(
        "场景反向参考图生成",
        [
            canonical_scene_reverse_master_path(context.output_dir, item)
            for item in scene_ids
        ],
    )

    prop_ids = tuple(
        dict.fromkeys(
            str(getattr(item, "prop_id", "") or "").strip()
            for episode in selected.values()
            for item in (getattr(episode, "prop_menu", None) or [])
            if str(getattr(item, "prop_id", "") or "").strip()
        )
    )
    prop_jobs: list[_Job] = []
    generated_prop_ids: list[str] = []
    for prop_id in prop_ids:
        if canonical_prop_reference_path(context.output_dir, prop_id).exists():
            continue
        store = await make_sqlite_store_for_context(context)
        try:
            is_global = await store.get_prop(prop_id) is not None
        finally:
            await store.close()
        if not is_global:
            continue

        async def start(name: str = prop_id) -> Any:
            store = await make_sqlite_store_for_context(context)
            try:
                return await prop_task_use_cases().schedule_reference(
                    repository=store,
                    task_context=context,
                    output_dir=context.output_dir,
                    prop_name=name,
                    style=scene_style,
                    model=image_generation_model,
                )
            finally:
                await store.close()

        prop_jobs.append(_Job(f"生成道具参考图：{prop_id}", 0, start))
        generated_prop_ids.append(prop_id)
    await _run_jobs(
        context,
        prop_jobs,
        max_parallel=max_parallel,
        timeout_seconds=timeout_seconds,
        reporter=reporter,
        progress=0.42,
    )
    _require_generated_files(
        "道具参考图生成",
        [
            canonical_prop_reference_path(context.output_dir, item)
            for item in generated_prop_ids
        ],
    )


async def _assign_colors(context: ProjectContext, episode_num: int) -> None:
    from ai_anime.modules.production.public import (
        AssignProjectSketchColorsCommand,
        sketch_marker_use_cases,
    )

    await sketch_marker_use_cases().assign_colors(
        context,
        AssignProjectSketchColorsCommand(episode_num=episode_num),
    )


async def _ensure_sketches(
    context: ProjectContext,
    episode_num: int,
    beats: list[dict[str, Any]],
    *,
    image_edit_model: str,
    aspect_ratio: str,
    timeout_seconds: float,
    reporter: _ProgressReporter,
    progress: float,
    force: bool = False,
) -> list[Path]:
    from ai_anime.modules.production.public import (
        GenerateSketchesCommand,
        RegenerateSelectedBeatsCommand,
        SELECTED_SKETCH_REGEN_TASK_TYPE,
        SKETCH_GENERATION_TASK_TYPE,
        SelectedRegenerationKind,
        sketch_generation_use_cases,
        sketch_scene_grid_split,
        selected_regeneration_use_cases,
    )

    resolver = PathResolver(context.output_dir, episode_num)
    sketch_plan = sketch_scene_grid_split(beats, aspect_ratio=aspect_ratio)
    sketchable_numbers = list(
        dict.fromkeys(
            int(number)
            for entry in sketch_plan
            for number in entry.get("beat_numbers", ())
            if int(number) > 0
        )
    )
    paths = [resolver.sketch(number) for number in sketchable_numbers]
    if not paths:
        return paths

    if force:
        reporter.update(progress, f"第 {episode_num} 集重新生成全部草图")
        scheduled = await sketch_generation_use_cases().generate(
            context,
            GenerateSketchesCommand(
                episode_num=episode_num,
                grid_index=-1,
                sketch_scene_grouping=True,
                aspect_ratio=aspect_ratio,
                image_generation_selection=image_edit_model,
                replace_existing=True,
            ),
        )
        tickets = [
            _ChildTicket(
                task_type=SKETCH_GENERATION_TASK_TYPE,
                task_id=receipt.task_id,
                label=f"第 {episode_num} 集草图网格 {receipt.grid_index}",
                episode=episode_num,
                scope=receipt.scope,
            )
            for receipt in scheduled.receipts
        ]
    else:
        missing_numbers = [
            number
            for number in sketchable_numbers
            if not resolver.sketch(number).exists()
        ]
        if not missing_numbers:
            return paths

        missing_set = set(missing_numbers)
        missing_beats = [
            beat
            for beat in beats
            if int(beat.get("beat_number") or 0) in missing_set
        ]
        missing_plan = [
            entry
            for entry in sketch_scene_grid_split(
                missing_beats,
                aspect_ratio=aspect_ratio,
            )
            if entry.get("beat_numbers")
        ]
        reporter.update(
            progress,
            f"第 {episode_num} 集补齐 {len(missing_numbers)} 个缺失草图",
        )
        tickets = []
        for plan_index, entry in enumerate(missing_plan, start=1):
            beat_numbers = tuple(int(number) for number in entry["beat_numbers"])
            scheduled = await selected_regeneration_use_cases().regenerate(
                context,
                RegenerateSelectedBeatsCommand(
                    kind=SelectedRegenerationKind.SKETCH,
                    episode_num=episode_num,
                    beat_indices=beat_numbers,
                    mode_key=str(entry["mode_key"]),
                    image_generation_selection=image_edit_model,
                ),
            )
            tickets.append(
                _ticket_from_scheduled(
                    scheduled,
                    label=(
                        f"第 {episode_num} 集缺失草图批次 {plan_index}"
                        f"（Beat {', '.join(str(number) for number in beat_numbers)}）"
                    ),
                    episode=episode_num,
                    task_type=SELECTED_SKETCH_REGEN_TASK_TYPE,
                )
            )

    await asyncio.gather(
        *(
            _wait_ticket(context, ticket, timeout_seconds=timeout_seconds)
            for ticket in tickets
        )
    )
    if not all(path.exists() for path in paths):
        missing = [path.name for path in paths if not path.exists()]
        raise RuntimeError("草图任务已完成但产物不完整：" + "、".join(missing))
    return paths


async def _ensure_detection(
    context: ProjectContext,
    episode_num: int,
    sketch_paths: list[Path],
    *,
    timeout_seconds: float,
    reporter: _ProgressReporter,
    progress: float,
) -> None:
    from ai_anime.modules.production.public import (
        AI_IDENTITY_DETECTION_TASK_TYPE,
        ScheduleSketchMarkerDetectionCommand,
        sketch_marker_detection_task_use_cases,
    )

    completed = _latest_completed_task(
        context,
        AI_IDENTITY_DETECTION_TASK_TYPE,
        episode_num,
    )
    if _completed_after_files(completed, sketch_paths):
        beats = await _episode_beats(context, episode_num)
        if beats and all(
            beat.get("detected_identities") is not None
            and beat.get("detected_props") is not None
            for beat in beats
        ):
            return
    reporter.update(progress, f"第 {episode_num} 集检测草图身份与道具")
    scheduled = await sketch_marker_detection_task_use_cases().schedule(
        context,
        ScheduleSketchMarkerDetectionCommand(episode_num=episode_num),
    )
    await _wait_ticket(
        context,
        _ticket_from_scheduled(
            scheduled,
            label=f"第 {episode_num} 集草图身份检测",
            episode=episode_num,
        ),
        timeout_seconds=timeout_seconds,
    )
    beats = await _episode_beats(context, episode_num)
    if not beats or not all(
        beat.get("detected_identities") is not None
        and beat.get("detected_props") is not None
        for beat in beats
    ):
        raise RuntimeError("草图身份检测任务已完成但检测结果未完整写入")


async def _ensure_global_optimization(
    context: ProjectContext,
    episode_num: int,
    *,
    timeout_seconds: float,
    reporter: _ProgressReporter,
    progress: float,
    force: bool = False,
) -> list[dict[str, Any]]:
    from ai_anime.modules.production.public import (
        OptimizeEpisodeVideoCommand,
        global_video_optimization_use_cases,
    )

    beats = await _episode_beats(context, episode_num)
    def has_mode_prompt(beat: dict[str, Any]) -> bool:
        mode = str(beat.get("video_mode") or "first_frame").strip()
        field = "keyframe_prompt" if mode == "keyframe" else "video_prompt"
        return bool(mode and str(beat.get(field) or "").strip())

    if (
        not force
        and beats
        and all(has_mode_prompt(beat) for beat in beats)
    ):
        return beats
    reporter.update(progress, f"第 {episode_num} 集全局优化视频提示词")
    scheduled = await global_video_optimization_use_cases().schedule(
        context,
        OptimizeEpisodeVideoCommand(episode_num=episode_num),
    )
    await _wait_ticket(
        context,
        _ticket_from_scheduled(
            scheduled,
            label=f"第 {episode_num} 集全局视频优化",
            episode=episode_num,
        ),
        timeout_seconds=timeout_seconds,
    )
    beats = await _episode_beats(context, episode_num)
    if not beats or not all(has_mode_prompt(beat) for beat in beats):
        raise RuntimeError("全局视频优化任务已完成但提示词未完整写入")
    return beats


async def _ensure_audio_prerequisites(
    context: ProjectContext,
    episode_num: int,
    beats: list[dict[str, Any]],
    *,
    reporter: _ProgressReporter,
    progress: float,
    force: bool = False,
) -> None:
    from ai_anime.modules.production.public import (
        AudioVoicePrerequisitesMissing,
        GenerateEpisodeAudioCommand,
        VoiceDesignModelUnavailable,
        episode_audio_use_cases,
        provision_voice_design_requirements,
    )

    candidates = _beat_numbers(beats)
    if not candidates:
        return
    reporter.update(progress, f"第 {episode_num} 集检查配音声线前置")
    command = GenerateEpisodeAudioCommand(
        episode_num=episode_num,
        mode="redo_all" if force else "sync_changed",
        beat_numbers=candidates,
    )
    plan = await episode_audio_use_cases().plan(context, command)
    if plan.errors and plan.voice_requirements:
        reporter.update(
            progress,
            f"第 {episode_num} 集自动设计 {len(plan.voice_requirements)} 条缺失声线",
        )
        try:
            await provision_voice_design_requirements(
                context,
                plan.voice_requirements,
            )
        except VoiceDesignModelUnavailable as exc:
            raise ProductionWorkflowModelPrerequisitesMissing(
                [
                    "文字声线设计模型缺失：当前未配置可用的 "
                    "AUDIO_VOICE_DESIGN 云端或 BYOK 模型"
                ]
            ) from exc
        reporter.update(progress, f"第 {episode_num} 集重新检查配音声线前置")
        plan = await episode_audio_use_cases().plan(context, command)
    if plan.errors:
        raise AudioVoicePrerequisitesMissing(list(plan.errors))


async def _ensure_first_frames(
    context: ProjectContext,
    episode_num: int,
    beats: list[dict[str, Any]],
    *,
    image_edit_model: str,
    aspect_ratio: str,
    timeout_seconds: float,
    reporter: _ProgressReporter,
    progress: float,
    force: bool = False,
) -> None:
    from ai_anime.modules.production.public import (
        RegenerateSelectedBeatsCommand,
        SelectedRegenerationKind,
        selected_regeneration_use_cases,
    )

    paths = PathResolver(context.output_dir, episode_num)
    missing = [
        number
        for number in _beat_numbers(beats)
        if force or not paths.frame(number).exists()
    ]
    if not missing:
        return
    before_mtime_ns = {
        number: (
            paths.frame(number).stat().st_mtime_ns
            if paths.frame(number).exists()
            else None
        )
        for number in missing
    }
    reporter.update(progress, f"第 {episode_num} 集生成缺失首帧")
    scheduled = await selected_regeneration_use_cases().regenerate(
        context,
        RegenerateSelectedBeatsCommand(
            kind=SelectedRegenerationKind.RENDER,
            episode_num=episode_num,
            beat_indices=tuple(missing),
            mode_key=("1x1_16-9" if aspect_ratio == "16:9" else "1x1_2-3"),
            image_generation_selection=image_edit_model,
        ),
    )
    result = await _wait_ticket(
        context,
        _ticket_from_scheduled(
            scheduled,
            label=f"第 {episode_num} 集首帧生成",
            episode=episode_num,
        ),
        timeout_seconds=timeout_seconds,
    )
    missing_after = [number for number in missing if not paths.frame(number).exists()]
    if missing_after:
        raise RuntimeError(
            "首帧任务已完成但产物不完整："
            + "、".join(f"Beat {number}" for number in missing_after)
        )
    stale_after = [
        number
        for number in missing
        if before_mtime_ns[number] is not None
        and paths.frame(number).stat().st_mtime_ns <= int(before_mtime_ns[number] or 0)
    ]
    if stale_after:
        raise RuntimeError(
            "首帧任务已完成但没有更新正式产物："
            + "、".join(f"Beat {number}" for number in stale_after)
        )
    updated_beats = {
        int(number)
        for number in (result.get("updated_beats") or [])
        if str(number).strip().isdigit()
    }
    if updated_beats and not set(missing).issubset(updated_beats):
        omitted = sorted(set(missing) - updated_beats)
        raise RuntimeError(
            "首帧任务返回的更新范围不完整："
            + "、".join(f"Beat {number}" for number in omitted)
        )


async def _ensure_video_prompts(
    context: ProjectContext,
    episode_num: int,
    beats: list[dict[str, Any]],
    *,
    requested_model: str | None,
    video_routing_policy: str = "project_selection",
    reporter: _ProgressReporter,
    progress: float,
    force: bool = False,
) -> list[dict[str, Any]]:
    from ai_anime.modules.narrative_planning.public import (
        GenerateVideoPromptCommand,
        generate_optimized_video_prompt,
    )
    from ai_anime.modules.production.public import (
        parse_video_config,
        resolve_video_generation_route,
        video_model_uses_advanced_reference_workflow,
    )

    model_route = resolve_video_generation_route(
        context.owner_username,
        context.project_name,
        requested_model,
        routing_policy=video_routing_policy,
    )
    if not video_model_uses_advanced_reference_workflow(model_route.model):
        return beats

    pending = [
        int(beat.get("beat_number") or 0)
        for beat in beats
        if int(beat.get("beat_number") or 0) > 0
        and (
            force
            or not parse_video_config(
                beat.get("video_config_json")
            ).final_prompt
        )
    ]
    if not pending:
        return beats

    store = await make_sqlite_store_for_context(context)
    try:
        for index, beat_num in enumerate(pending, start=1):
            reporter.update(
                progress,
                f"第 {episode_num} 集生成视频提示词 "
                f"{index}/{len(pending)}（Beat {beat_num}）",
            )
            await generate_optimized_video_prompt(
                store,
                GenerateVideoPromptCommand(
                    episode_num=episode_num,
                    beat_num=beat_num,
                    project_dir=context.output_dir,
                    requester_user_id=str(
                        context.requester_user_id or context.requester_username
                    ),
                    project_id=str(context.project_id or ""),
                ),
            )
    finally:
        await store.close()

    updated = await _episode_beats(context, episode_num)
    missing_after = [
        int(beat.get("beat_number") or 0)
        for beat in updated
        if int(beat.get("beat_number") or 0) > 0
        and not parse_video_config(beat.get("video_config_json")).final_prompt
    ]
    if missing_after:
        raise RuntimeError(
            "视频最终提示词生成后仍有空值："
            + "、".join(f"Beat {number}" for number in missing_after)
        )
    return updated


async def _ensure_video_voice_prerequisites(
    context: ProjectContext,
    episode_num: int,
    beats: list[dict[str, Any]],
    *,
    requested_model: str | None,
    video_routing_policy: str = "project_selection",
    reporter: _ProgressReporter,
    progress: float,
    force: bool = False,
) -> None:
    from ai_anime.modules.production.public import (
        VoiceDesignModelUnavailable,
        build_character_voice_requirement,
        collect_video_reference_prereq_errors,
        provision_voice_design_requirements,
        resolve_video_generation_route,
        video_model_uses_advanced_reference_workflow,
    )

    paths = PathResolver(context.output_dir, episode_num)
    if not force and all(
        paths.video(number).exists() for number in _beat_numbers(beats)
    ):
        return
    model_route = resolve_video_generation_route(
        context.owner_username,
        context.project_name,
        requested_model,
        routing_policy=video_routing_policy,
    )
    if not video_model_uses_advanced_reference_workflow(model_route.model):
        return

    async def load_characters() -> list[Any]:
        store = await make_sqlite_store_for_context(context)
        try:
            return list(store.get_all_characters())
        finally:
            await store.close()

    characters = await load_characters()
    errors = collect_video_reference_prereq_errors(
        project_output=context.output_dir,
        episode=episode_num,
        beats=beats,
        characters=characters,
    )
    audio_errors = [error for error in errors if error.media_type == "audio"]
    if not audio_errors:
        return

    beats_by_number = {
        int(beat.get("beat_number") or 0): beat
        for beat in beats
        if int(beat.get("beat_number") or 0) > 0
    }
    requirements = {}
    for error in audio_errors:
        beat = beats_by_number.get(error.beat_number, {})
        preview = str(
            beat.get("dialogue")
            or beat.get("narration_segment")
            or beat.get("narration")
            or ""
        ).strip()
        requirement = build_character_voice_requirement(
            characters,
            speaker=error.identity_id,
            preview_text=preview,
        )
        if requirement is not None:
            requirements[requirement.key] = requirement

    if requirements:
        reporter.update(
            progress,
            f"第 {episode_num} 集重建 {len(requirements)} 条不合规参考声线",
        )
        try:
            await provision_voice_design_requirements(
                context,
                tuple(requirements.values()),
            )
        except VoiceDesignModelUnavailable as exc:
            raise ProductionWorkflowModelPrerequisitesMissing(
                [
                    "文字声线设计模型缺失：当前未配置可用的 "
                    "AUDIO_VOICE_DESIGN 云端或 BYOK 模型"
                ]
            ) from exc
        characters = await load_characters()
        errors = collect_video_reference_prereq_errors(
            project_output=context.output_dir,
            episode=episode_num,
            beats=beats,
            characters=characters,
        )
        audio_errors = [error for error in errors if error.media_type == "audio"]

    if audio_errors:
        details = [
            f"Beat {error.beat_number} {error.label}：{error.reason}"
            for error in audio_errors
        ]
        raise RuntimeError("视频参考声线前置不满足：" + "；".join(details))


async def _ensure_audio(
    context: ProjectContext,
    episode_num: int,
    beats: list[dict[str, Any]],
    *,
    timeout_seconds: float,
    reporter: _ProgressReporter,
    progress: float,
    force: bool = False,
) -> None:
    from ai_anime.modules.production.public import (
        EpisodeAudioGenerationNotRequired,
        GenerateEpisodeAudioCommand,
        episode_audio_use_cases,
    )

    paths = PathResolver(context.output_dir, episode_num)
    candidates = _beat_numbers(beats)
    if not candidates:
        return
    reporter.update(progress, f"第 {episode_num} 集补齐或更新分镜配音")
    try:
        scheduled = await episode_audio_use_cases().generate(
            context,
            GenerateEpisodeAudioCommand(
                episode_num=episode_num,
                mode="redo_all" if force else "sync_changed",
                beat_numbers=candidates,
            ),
        )
    except EpisodeAudioGenerationNotRequired:
        return
    await _wait_ticket(
        context,
        _ticket_from_scheduled(
            scheduled,
            label=f"第 {episode_num} 集配音生成",
            episode=episode_num,
        ),
        timeout_seconds=timeout_seconds,
    )
    missing_after = [
        number for number in scheduled.beat_numbers if not paths.audio(number).exists()
    ]
    if missing_after:
        raise RuntimeError(
            "配音任务已完成但产物不完整："
            + "、".join(f"Beat {number}" for number in missing_after)
        )


async def _ensure_videos(
    context: ProjectContext,
    episode_num: int,
    beats: list[dict[str, Any]],
    *,
    requested_model: str | None,
    video_routing_policy: str = "project_selection",
    resolution: str,
    aspect_ratio: str,
    use_director_render: bool,
    timeout_seconds: float,
    reporter: _ProgressReporter,
    progress: float,
    force: bool = False,
) -> None:
    from ai_anime.modules.production.public import (
        GenerateSingleVideoCommand,
        resolve_video_generation_route,
        single_video_use_cases,
    )

    paths = PathResolver(context.output_dir, episode_num)
    missing = [
        number
        for number in _beat_numbers(beats)
        if force or not paths.video(number).exists()
    ]
    if not missing:
        return
    model_route = resolve_video_generation_route(
        context.owner_username,
        context.project_name,
        requested_model,
        routing_policy=video_routing_policy,
    )
    for index, beat_num in enumerate(missing, start=1):
        reporter.update(
            progress,
            f"第 {episode_num} 集生成视频 {index}/{len(missing)}（Beat {beat_num}）",
        )
        scheduled = await single_video_use_cases().generate(
            context,
            GenerateSingleVideoCommand(
                episode_num=episode_num,
                beat_num=beat_num,
                video_model=model_route.model,
                model_selector=model_route.selector or None,
                resolution=resolution,
                ratio=aspect_ratio,
                use_director_render=use_director_render,
                provided_fields=frozenset({"resolution", "ratio"}),
            ),
        )
        await _wait_ticket(
            context,
            _ticket_from_scheduled(
                scheduled,
                label=f"第 {episode_num} 集 Beat {beat_num} 视频生成",
                episode=episode_num,
                beat_num=beat_num,
            ),
            timeout_seconds=timeout_seconds,
        )
        if not paths.video(beat_num).exists():
            raise RuntimeError(f"Beat {beat_num} 视频任务已完成但没有生成视频文件")


async def _ensure_composed(
    context: ProjectContext,
    episode_num: int,
    beats: list[dict[str, Any]],
    *,
    resolution: str,
    add_subtitles: bool,
    add_bgm: bool,
    timeout_seconds: float,
    reporter: _ProgressReporter,
    progress: float,
    force: bool = False,
) -> Path:
    from ai_anime.modules.production.public import (
        ComposeEpisodeVideoCommand,
        episode_video_use_cases,
    )

    paths = PathResolver(context.output_dir, episode_num)
    final_path = paths.final_video()
    source_paths = [paths.video(number) for number in _beat_numbers(beats)]
    source_paths.extend(
        path
        for path in (paths.audio(number) for number in _beat_numbers(beats))
        if path.exists()
    )
    final_is_current = (
        final_path.exists()
        and bool(source_paths)
        and all(path.exists() for path in source_paths)
        and final_path.stat().st_mtime_ns
        >= max(path.stat().st_mtime_ns for path in source_paths)
    )
    if not force and final_is_current:
        return final_path
    reporter.update(progress, f"第 {episode_num} 集合成最终视频")
    scheduled = await episode_video_use_cases().compose(
        context,
        ComposeEpisodeVideoCommand(
            episode_num=episode_num,
            add_subtitles=add_subtitles,
            add_bgm=add_bgm,
            resolution=resolution,
        ),
    )
    await _wait_ticket(
        context,
        _ticket_from_scheduled(
            scheduled,
            label=f"第 {episode_num} 集视频合成",
            episode=episode_num,
        ),
        timeout_seconds=timeout_seconds,
    )
    if not final_path.exists():
        raise RuntimeError("合成任务已完成但最终视频不存在")
    return final_path


async def _run_production_workflow_steps(
    envelope: dict[str, Any],
    context: ProjectContext,
) -> dict[str, Any]:
    payload = dict(envelope.get("payload") or {})
    reporter = _ProgressReporter(context, envelope)
    timeout_seconds = float(payload.get("node_timeout_seconds") or 7200)
    max_parallel = int(payload.get("max_parallel") or 4)
    reporter.update(0.01, "分析完整生产工作流")

    script_options = ScriptWorkflowOptions(
        mode="through",
        target="script",
        episodes=tuple(int(value) for value in payload.get("episodes") or ()),
        filename=str(payload.get("filename") or ""),
        rebuild=bool(payload.get("rebuild", False)),
        spine_template=payload.get("spine_template"),
        visual_style=payload.get("visual_style"),
        narration_style=payload.get("narration_style"),
        ethnicity=payload.get("ethnicity"),
        target_episodes=int(payload.get("target_episodes") or 10),
        planning_mode=str(payload.get("planning_mode") or "chapters"),
        script_mode=str(payload.get("script_mode") or "duration"),
        target_duration_total=int(payload.get("target_duration_total") or 120),
        target_beats=(
            int(payload["target_beats"])
            if payload.get("target_beats") is not None
            else None
        ),
        max_parallel=max_parallel,
    )
    script_runtime = ProjectScriptWorkflowRuntime(
        context=context,
        envelope=envelope,
        parent_task_type=PRODUCTION_WORKFLOW_TASK_TYPE,
        progress_start=0.02,
        progress_end=0.25,
    )
    script_result = await ScriptWorkflowExecutor(script_runtime).execute(
        script_options,
        timeout_seconds=timeout_seconds,
    )
    overwrite_existing_assets = bool(payload.get("rebuild", False))

    _characters, episodes = await _load_story_state(context)
    planned_episode_numbers = tuple(
        sorted(
            int(getattr(episode, "number", 0) or 0)
            for episode in episodes
            if int(getattr(episode, "number", 0) or 0) > 0
        )
    )
    episode_numbers = tuple(
        dict.fromkeys(script_options.episodes or planned_episode_numbers)
    )
    missing_episodes = [
        episode for episode in episode_numbers if episode not in planned_episode_numbers
    ]
    if missing_episodes:
        raise RuntimeError(
            "分集规划中不存在："
            + "、".join(f"第 {episode} 集" for episode in missing_episodes)
        )
    if not episode_numbers:
        raise RuntimeError("没有可生产的分集")

    reporter.update(0.27, "检查生产图片模型前置")
    image_generation_model, image_edit_model = _resolve_production_image_models()

    await _plan_missing_props(
        context,
        episode_numbers,
        timeout_seconds=timeout_seconds,
        max_parallel=max_parallel,
        reporter=reporter,
    )
    await _generate_missing_world_assets(
        context,
        episode_numbers,
        image_generation_model=image_generation_model,
        image_edit_model=image_edit_model,
        timeout_seconds=timeout_seconds,
        max_parallel=max_parallel,
        reporter=reporter,
    )

    config = load_project_config(context.owner_username, context.project_name)
    aspect_ratio = "16:9" if str(config.get("aspect_ratio")) == "16:9" else "2:3"
    from ai_anime.modules.production.public import resolve_episode_video_resolution

    resolution = resolve_episode_video_resolution(
        payload.get("video_resolution") or config.get("video_resolution"),
        aspect_ratio,
    )
    use_director_render = bool(config.get("use_director_render", False))
    add_subtitles = bool(payload.get("add_subtitles", True))
    add_bgm = bool(payload.get("add_bgm", False))
    video_routing_policy = str(
        payload.get("video_routing_policy") or "project_selection"
    )
    results: list[dict[str, Any]] = []

    episode_span = 0.55 / len(episode_numbers)
    for episode_index, episode_num in enumerate(episode_numbers):
        base = 0.43 + episode_index * episode_span
        beats = await _episode_beats(context, episode_num)
        if not beats:
            raise RuntimeError(f"第 {episode_num} 集脚本没有 Beat")
        reporter.update(base, f"第 {episode_num} 集校准脚本身份标记")
        await _reconcile_episode_identity_markers(
            context,
            episode_num,
        )
        beats = await _episode_beats(context, episode_num)
        reporter.update(base, f"第 {episode_num} 集分配草图标记颜色")
        await _assign_colors(context, episode_num)
        sketch_paths = await _ensure_sketches(
            context,
            episode_num,
            beats,
            image_edit_model=image_edit_model,
            aspect_ratio=aspect_ratio,
            timeout_seconds=timeout_seconds,
            reporter=reporter,
            progress=base + episode_span * 0.08,
            force=overwrite_existing_assets,
        )
        await _ensure_detection(
            context,
            episode_num,
            sketch_paths,
            timeout_seconds=timeout_seconds,
            reporter=reporter,
            progress=base + episode_span * 0.20,
        )
        await _ensure_first_frames(
            context,
            episode_num,
            beats,
            image_edit_model=image_edit_model,
            aspect_ratio=aspect_ratio,
            timeout_seconds=timeout_seconds,
            reporter=reporter,
            progress=base + episode_span * 0.32,
            force=overwrite_existing_assets,
        )
        beats = await _ensure_global_optimization(
            context,
            episode_num,
            timeout_seconds=timeout_seconds,
            reporter=reporter,
            progress=base + episode_span * 0.40,
            force=overwrite_existing_assets,
        )
        await _ensure_audio_prerequisites(
            context,
            episode_num,
            beats,
            reporter=reporter,
            progress=base + episode_span * 0.45,
            force=overwrite_existing_assets,
        )
        await _ensure_video_voice_prerequisites(
            context,
            episode_num,
            beats,
            requested_model=payload.get("video_model"),
            video_routing_policy=video_routing_policy,
            reporter=reporter,
            progress=base + episode_span * 0.52,
            force=overwrite_existing_assets,
        )
        beats = await _ensure_video_prompts(
            context,
            episode_num,
            beats,
            requested_model=payload.get("video_model"),
            video_routing_policy=video_routing_policy,
            reporter=reporter,
            progress=base + episode_span * 0.54,
            force=overwrite_existing_assets,
        )
        await _ensure_audio(
            context,
            episode_num,
            beats,
            timeout_seconds=timeout_seconds,
            reporter=reporter,
            progress=base + episode_span * 0.58,
            force=overwrite_existing_assets,
        )
        await _ensure_videos(
            context,
            episode_num,
            beats,
            requested_model=payload.get("video_model"),
            video_routing_policy=video_routing_policy,
            resolution=resolution,
            aspect_ratio=aspect_ratio,
            use_director_render=use_director_render,
            timeout_seconds=timeout_seconds,
            reporter=reporter,
            progress=base + episode_span * 0.72,
            force=overwrite_existing_assets,
        )
        final_path = await _ensure_composed(
            context,
            episode_num,
            beats,
            resolution=resolution,
            add_subtitles=add_subtitles,
            add_bgm=add_bgm,
            timeout_seconds=timeout_seconds,
            reporter=reporter,
            progress=base + episode_span * 0.95,
            force=overwrite_existing_assets,
        )
        results.append(
            {
                "episode": episode_num,
                "beats": len(beats),
                "final_video": final_path.relative_to(context.output_dir).as_posix(),
            }
        )

    reporter.update(0.99, "全部分集已完成")
    return {
        "script_workflow": script_result,
        "episodes": results,
        "completed_episodes": list(episode_numbers),
    }


async def _run_production_workflow(
    envelope: dict[str, Any],
    context: ProjectContext,
) -> dict[str, Any]:
    try:
        return await _run_production_workflow_steps(envelope, context)
    except BaseException:
        parent_task_id = str(envelope.get("__run_task_id") or "").strip()
        if parent_task_id:
            await asyncio.shield(
                _cancel_owned_child_tasks(context, parent_task_id)
            )
        raise


def run_production_workflow(
    envelope: dict[str, Any],
    context: ProjectContext,
) -> dict[str, Any]:
    scope = str(envelope.get("scope") or "") or None
    return asyncio.run(
        await_envelope_with_cancel_watch(
            _run_production_workflow(envelope, context),
            envelope,
            task_type=PRODUCTION_WORKFLOW_TASK_TYPE,
            scope=scope,
        )
    )


register_project_task_runner(PRODUCTION_WORKFLOW_TASK_TYPE, run_production_workflow)


__all__ = [
    "PRODUCTION_WORKFLOW_TASK_TYPE",
    "run_production_workflow",
]
