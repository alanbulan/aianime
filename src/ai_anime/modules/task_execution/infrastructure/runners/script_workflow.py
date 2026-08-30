"""Runner for the dependency-aware script production graph."""

from __future__ import annotations

import asyncio
import time
from typing import Any

from ai_anime.modules.narrative_planning.public import (
    ScriptWorkflowExecutor,
    ScriptWorkflowNode,
    ScriptWorkflowOptions,
    ScriptWorkflowPlan,
    ScriptWorkflowSnapshot,
    ScriptWorkflowTicket,
)
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.modules.task_execution.public import (
    ProjectTask,
    ProjectTaskRef,
    await_envelope_with_cancel_watch,
    script_beats_complete,
    effective_task_status,
    project_task_state_key,
    project_task_use_cases,
    register_project_task_runner,
)
from ai_anime.modules.task_execution.infrastructure.task_state import (
    get_task_manager,
)

_ACTIVE_STATUSES = frozenset({"submitting", "queued", "running", "cancelling"})
_FAILED_STATUSES = frozenset({"failed", "cancelled", "canceled"})
_TASK_NOT_FOUND_GRACE_SECONDS = 10.0


def _task_ref_for_node(node: ScriptWorkflowNode) -> ProjectTaskRef:
    episode = int(node.episode or 0)
    if node.stage == "ingest":
        return ProjectTaskRef("ingest_fast", 0)
    if node.stage == "characters":
        return ProjectTaskRef("build_characters", 0)
    if node.stage == "episodes":
        return ProjectTaskRef("build_episodes", 0)
    if node.stage == "identities":
        return ProjectTaskRef("identity_planner", episode)
    if node.stage == "scenes":
        return ProjectTaskRef(
            "episode_scene_planner",
            episode,
            scope=f"scene_run_ep{episode:03d}",
        )
    return ProjectTaskRef("script_writer", episode)


def _node_id_for_task(task: ProjectTask) -> str | None:
    if task.task_type == "ingest_fast":
        return "ingest"
    if task.task_type == "build_characters":
        return "characters"
    if task.task_type == "build_episodes":
        return "episodes"
    if task.episode <= 0:
        return None
    prefix = {
        "identity_planner": "identities",
        "episode_scene_planner": "scenes",
        "script_writer": "script",
    }.get(task.task_type)
    return f"{prefix}:ep{task.episode:03d}" if prefix else None


def _ticket_from_task(
    node: ScriptWorkflowNode, task: ProjectTask
) -> ScriptWorkflowTicket:
    return ScriptWorkflowTicket(
        node_id=node.node_id,
        task_type=task.task_type,
        task_id=task.task_id,
        task_key=project_task_state_key(
            task.task_type,
            task.project_id,
            task.episode,
            beat_num=task.beat_num,
            scope=task.scope,
        ),
        episode=task.episode,
        scope=task.scope,
    )


def _ticket_from_scheduled(
    node: ScriptWorkflowNode,
    scheduled: Any,
) -> ScriptWorkflowTicket:
    def get_value(key: str, default: Any = None) -> Any:
        if isinstance(scheduled, dict):
            return scheduled.get(key, default)
        return getattr(scheduled, key, default)

    return ScriptWorkflowTicket(
        node_id=node.node_id,
        task_type=str(get_value("task_type") or ""),
        task_id=str(get_value("task_id") or ""),
        task_key=str(get_value("task_key") or ""),
        episode=int(node.episode or 0),
        scope=get_value("scope"),
    )


class ProjectScriptWorkflowRuntime:
    def __init__(
        self,
        *,
        context: ProjectContext,
        envelope: dict[str, Any],
        parent_task_type: str = "script_workflow",
        progress_start: float = 0.02,
        progress_end: float = 0.95,
    ) -> None:
        self._context = context
        self._parent_task_type = parent_task_type
        self._scope = str(envelope.get("scope") or "") or None
        self._parent_task_id = str(envelope.get("__run_task_id") or "") or None
        self._last_report: (
            tuple[tuple[str, ...], tuple[tuple[str, ...], ...]] | None
        ) = None
        self._progress_start = progress_start
        self._progress_end = progress_end
        self._reported_progress = progress_start

    async def snapshot(
        self,
        options: ScriptWorkflowOptions,
    ) -> ScriptWorkflowSnapshot:
        from ai_anime.shared.infrastructure.project_stores import (
            make_sqlite_store_for_context,
        )

        store = await make_sqlite_store_for_context(self._context)
        try:
            characters = list(store.get_all_characters() or [])
            episodes = list(store.get_all_episodes() or [])
            episode_numbers = tuple(
                sorted(
                    {
                        int(getattr(episode, "number", 0) or 0)
                        for episode in episodes
                        if int(getattr(episode, "number", 0) or 0) > 0
                    }
                )
            )
            identities: set[int] = set()
            scenes: set[int] = set()
            scripts: set[int] = set()
            script_target_mismatches: set[int] = set()
            for episode in episodes:
                episode_number = int(getattr(episode, "number", 0) or 0)
                if episode_number <= 0:
                    continue
                if getattr(episode, "identity_ids", None):
                    identities.add(episode_number)
                if getattr(episode, "scene_menu", None):
                    scenes.add(episode_number)
                beats = await store.get_beats_as_dicts(episode_number)
                if script_beats_complete(beats, options.target_beats):
                    scripts.add(episode_number)
                elif (
                    options.target_beats is not None
                    and beats
                    and len(beats) != options.target_beats
                    and script_beats_complete(beats, None)
                ):
                    script_target_mismatches.add(episode_number)
        finally:
            await store.close()

        task_statuses: dict[str, str] = {}
        tasks = project_task_use_cases().list_for_project(self._context)
        for task in tasks:
            node_id = _node_id_for_task(task)
            if node_id is None or node_id in task_statuses:
                continue
            if (
                task.task_type == "script_writer"
                and task.episode in script_target_mismatches
                and effective_task_status(task) == "completed"
            ):
                continue
            task_statuses[node_id] = effective_task_status(task)

        ingest_status = task_statuses.get("ingest", "")
        return ScriptWorkflowSnapshot(
            ingested=(
                ingest_status == "completed" or bool(characters) or bool(episodes)
            ),
            has_characters=bool(characters),
            episode_numbers=episode_numbers,
            identity_episodes=frozenset(identities),
            scene_episodes=frozenset(scenes),
            script_episodes=frozenset(scripts),
            task_statuses=task_statuses,
        )

    async def start(
        self,
        node: ScriptWorkflowNode,
        options: ScriptWorkflowOptions,
    ) -> ScriptWorkflowTicket:
        if node.status == "running":
            existing = project_task_use_cases().get_for_project(
                self._context,
                _task_ref_for_node(node),
            )
            if (
                existing is not None
                and effective_task_status(existing) in _ACTIVE_STATUSES
            ):
                return _ticket_from_task(node, existing)

        if node.stage == "ingest":
            from ai_anime.modules.project_workspace.public import (
                default_aspect_ratio_for_spine_template,
                load_project_config,
                save_project_config,
            )
            from ai_anime.modules.story_intake.public import (
                StartIngestionCommand,
                create_story_intake_application,
            )

            application = create_story_intake_application(
                load_project_config=load_project_config,
                save_project_config=save_project_config,
                default_aspect_ratio=default_aspect_ratio_for_spine_template,
            )
            scheduled = await application.start_ingestion.execute(
                self._context,
                StartIngestionCommand(
                    filename=options.filename,
                    rebuild=options.rebuild,
                    spine_template=options.spine_template,
                    visual_style=options.visual_style,
                    narration_style=options.narration_style,
                    ethnicity=options.ethnicity,
                ),
            )
        elif node.stage == "characters":
            from ai_anime.modules.asset_world.public import character_task_use_cases

            scheduled = await character_task_use_cases().schedule_build_characters(
                task_context=self._context,
                output_dir=self._context.output_dir,
            )
        elif node.stage == "episodes":
            from ai_anime.modules.narrative_planning.public import (
                start_episode_planning,
            )

            scheduled = await start_episode_planning(
                self._context,
                target_episodes=options.episode_plan_size,
                planning_mode=options.planning_mode,
                output_dir=self._context.output_dir,
                state_dir=self._context.state_dir,
            )
        elif node.stage == "identities":
            from ai_anime.modules.narrative_planning.public import (
                start_episode_identity_planning,
            )

            scheduled = await start_episode_identity_planning(
                self._context,
                episode_num=int(node.episode or 0),
            )
        elif node.stage == "scenes":
            from ai_anime.modules.narrative_planning.public import (
                start_episode_asset_planning,
            )

            scheduled = await start_episode_asset_planning(
                self._context,
                episode_num=int(node.episode or 0),
                asset_kind="scene",
            )
        else:
            from ai_anime.modules.narrative_planning.public import (
                start_episode_script_generation,
            )
            from ai_anime.shared.infrastructure.project_stores import (
                make_sqlite_store_for_context,
            )

            store = await make_sqlite_store_for_context(self._context)
            try:
                scheduled = await start_episode_script_generation(
                    store,
                    task_context=self._context,
                    output_dir=self._context.output_dir,
                    episode_num=int(node.episode or 0),
                    script_mode=options.script_mode,
                    target_duration_total=options.target_duration_total,
                    target_beats=options.target_beats,
                )
            finally:
                await store.close()

        ticket = _ticket_from_scheduled(node, scheduled)
        if not ticket.task_type or not ticket.task_id or not ticket.task_key:
            raise RuntimeError(f"{node.label}没有返回完整任务标识")
        return ticket

    async def wait(
        self,
        ticket: ScriptWorkflowTicket,
        *,
        timeout_seconds: float,
    ) -> dict[str, Any]:
        started = time.monotonic()
        missing_since: float | None = None
        reference = ProjectTaskRef(
            task_type=ticket.task_type,
            episode=ticket.episode,
            scope=ticket.scope,
        )
        while True:
            task = project_task_use_cases().get_for_project(
                self._context,
                reference,
            )
            now = time.monotonic()
            if task is None:
                missing_since = missing_since or now
                if now - missing_since >= _TASK_NOT_FOUND_GRACE_SECONDS:
                    raise RuntimeError(
                        f"任务中心未找到 {ticket.node_id}（{ticket.task_key}）"
                    )
            else:
                missing_since = None
                if task.task_id != ticket.task_id:
                    raise RuntimeError(
                        f"任务 {ticket.node_id} 已被新的运行替换，"
                        f"期望 {ticket.task_id}，实际 {task.task_id}"
                    )
                status = effective_task_status(task)
                if status == "completed":
                    return dict(task.result or {})
                if status in _FAILED_STATUSES:
                    detail = str(task.error or task.current_task or status).strip()
                    raise RuntimeError(f"{ticket.node_id} 执行失败：{detail}")
            if now - started >= timeout_seconds:
                raise TimeoutError(
                    f"等待 {ticket.node_id} 超时（{int(timeout_seconds)} 秒）"
                )
            await asyncio.sleep(0.5)

    def report(
        self,
        plan: ScriptWorkflowPlan,
        *,
        batches: list[list[str]],
        current_batch: list[str] | None = None,
    ) -> None:
        current = tuple(current_batch or ())
        batch_snapshot = tuple(tuple(batch) for batch in batches)
        report_key = (current, batch_snapshot)
        if report_key == self._last_report:
            return
        self._last_report = report_key

        executable = [node for node in plan.nodes if node.execute]
        completed = sum(node.status == "completed" for node in executable)
        raw_progress = completed / max(len(executable), 1)
        if plan.dynamic_episode_expansion and not plan.selected_episodes:
            raw_progress = min(raw_progress * 0.25, 0.25)
        progress = min(
            self._progress_end,
            self._progress_start
            + raw_progress * (self._progress_end - self._progress_start),
        )
        self._reported_progress = max(self._reported_progress, progress)
        current_task = (
            "并行执行：" + "、".join(current) if current else "分析脚本生产图依赖"
        )
        logs = [current_task] if current else None
        get_task_manager().update_progress_for_project(
            self._context,
            self._parent_task_type,
            0,
            scope=self._scope,
            progress=self._reported_progress,
            current_task=current_task,
            logs=logs,
            expected_task_id=self._parent_task_id,
        )


async def _run_script_workflow(
    envelope: dict[str, Any],
    context: ProjectContext,
) -> dict[str, Any]:
    payload = dict(envelope.get("payload") or {})
    options = ScriptWorkflowOptions(
        mode=str(payload.get("mode") or "through"),
        target=str(payload.get("target") or "script"),
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
        max_parallel=int(payload.get("max_parallel") or 4),
    )
    timeout_seconds = float(payload.get("node_timeout_seconds") or 7200)
    runtime = ProjectScriptWorkflowRuntime(context=context, envelope=envelope)
    return await ScriptWorkflowExecutor(runtime).execute(
        options,
        timeout_seconds=timeout_seconds,
    )


def run_script_workflow(
    envelope: dict[str, Any],
    context: ProjectContext,
) -> dict[str, Any]:
    scope = str(envelope.get("scope") or "") or None
    return asyncio.run(
        await_envelope_with_cancel_watch(
            _run_script_workflow(envelope, context),
            envelope,
            task_type="script_workflow",
            scope=scope,
        )
    )


register_project_task_runner("script_workflow", run_script_workflow)


__all__ = ["ProjectScriptWorkflowRuntime", "run_script_workflow"]
