"""Dependency graph for story-to-episode-script production."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field, replace
from typing import Any, Literal, Protocol


ScriptWorkflowStage = Literal[
    "ingest",
    "characters",
    "episodes",
    "identities",
    "scenes",
    "script",
]
ScriptWorkflowMode = Literal["single", "through"]

_STAGE_ORDER: tuple[ScriptWorkflowStage, ...] = (
    "ingest",
    "characters",
    "episodes",
    "identities",
    "scenes",
    "script",
)
_STAGE_LABELS: dict[ScriptWorkflowStage, str] = {
    "ingest": "摄入原文",
    "characters": "提取角色",
    "episodes": "规划分集",
    "identities": "规划角色身份",
    "scenes": "规划场景",
    "script": "生成分集脚本",
}
_ACTIVE_TASK_STATUSES = frozenset({"submitting", "queued", "running", "cancelling"})


@dataclass(frozen=True)
class ScriptWorkflowOptions:
    mode: ScriptWorkflowMode = "through"
    target: ScriptWorkflowStage = "script"
    episodes: tuple[int, ...] = ()
    filename: str = ""
    rebuild: bool = False
    spine_template: str | None = None
    target_episodes: int = 10
    planning_mode: str = "chapters"
    script_mode: str = "duration"
    target_duration_total: int = 120
    target_beats: int | None = None
    max_parallel: int = 4

    def __post_init__(self) -> None:
        if self.mode not in {"single", "through"}:
            raise ValueError("workflow mode must be single or through")
        if self.target not in _STAGE_ORDER:
            raise ValueError("workflow target is invalid")
        if any(episode <= 0 for episode in self.episodes):
            raise ValueError("episode numbers must be positive")
        if self.spine_template not in {None, "drama", "narrated"}:
            raise ValueError("spine_template must be drama or narrated")
        if self.script_mode not in {"duration", "literal"}:
            raise ValueError("script_mode must be duration or literal")
        if self.target_beats is not None and not 5 <= self.target_beats <= 80:
            raise ValueError("target_beats must be between 5 and 80")
        if not 1 <= self.max_parallel <= 6:
            raise ValueError("max_parallel must be between 1 and 6")

    @property
    def episode_plan_size(self) -> int:
        return max(self.target_episodes, max(self.episodes, default=0))


@dataclass(frozen=True)
class ScriptWorkflowSnapshot:
    ingested: bool = False
    has_characters: bool = False
    episode_numbers: tuple[int, ...] = ()
    identity_episodes: frozenset[int] = frozenset()
    scene_episodes: frozenset[int] = frozenset()
    script_episodes: frozenset[int] = frozenset()
    task_statuses: dict[str, str] = field(default_factory=dict)


@dataclass(frozen=True)
class ScriptWorkflowNode:
    node_id: str
    stage: ScriptWorkflowStage
    label: str
    episode: int | None
    dependencies: tuple[str, ...]
    execute: bool
    status: Literal["completed", "ready", "running", "waiting", "blocked"]
    blocked_reason: str = ""

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.node_id,
            "stage": self.stage,
            "label": self.label,
            "episode": self.episode,
            "dependencies": list(self.dependencies),
            "execute": self.execute,
            "status": self.status,
            "blocked_reason": self.blocked_reason,
        }


@dataclass(frozen=True)
class ScriptWorkflowPlan:
    mode: ScriptWorkflowMode
    target: ScriptWorkflowStage
    selected_episodes: tuple[int, ...]
    dynamic_episode_expansion: bool
    nodes: tuple[ScriptWorkflowNode, ...]
    target_complete: bool

    def as_dict(self) -> dict[str, Any]:
        return {
            "kind": "script_workflow_graph",
            "mode": self.mode,
            "target": self.target,
            "selected_episodes": list(self.selected_episodes),
            "dynamic_episode_expansion": self.dynamic_episode_expansion,
            "target_complete": self.target_complete,
            "nodes": [node.as_dict() for node in self.nodes],
        }


@dataclass(frozen=True)
class ScriptWorkflowTicket:
    node_id: str
    task_type: str
    task_id: str
    task_key: str
    episode: int = 0
    scope: str | None = None


class ScriptWorkflowRuntime(Protocol):
    async def snapshot(
        self, options: ScriptWorkflowOptions
    ) -> ScriptWorkflowSnapshot: ...

    async def start(
        self,
        node: ScriptWorkflowNode,
        options: ScriptWorkflowOptions,
    ) -> ScriptWorkflowTicket: ...

    async def wait(
        self,
        ticket: ScriptWorkflowTicket,
        *,
        timeout_seconds: float,
    ) -> dict[str, Any]: ...

    def report(
        self,
        plan: ScriptWorkflowPlan,
        *,
        batches: list[list[str]],
        current_batch: list[str] | None = None,
    ) -> None: ...


class ScriptWorkflowBlocked(RuntimeError):
    def __init__(self, message: str, plan: ScriptWorkflowPlan) -> None:
        super().__init__(message)
        self.plan = plan


def _node_id(stage: ScriptWorkflowStage, episode: int | None = None) -> str:
    return stage if episode is None else f"{stage}:ep{episode:03d}"


def _node_complete(
    stage: ScriptWorkflowStage,
    episode: int | None,
    snapshot: ScriptWorkflowSnapshot,
) -> bool:
    if stage == "ingest":
        return snapshot.ingested
    if stage == "characters":
        return snapshot.has_characters
    if stage == "episodes":
        return bool(snapshot.episode_numbers)
    if episode is None:
        return False
    if stage == "identities":
        return episode in snapshot.identity_episodes
    if stage == "scenes":
        return episode in snapshot.scene_episodes
    return episode in snapshot.script_episodes


def _required_stages(target: ScriptWorkflowStage) -> frozenset[ScriptWorkflowStage]:
    target_index = _STAGE_ORDER.index(target)
    required = set(_STAGE_ORDER[: target_index + 1])
    if target == "identities":
        required.discard("scenes")
    elif target == "scenes":
        required.discard("identities")
    return frozenset(required)


def _stage_is_executable(
    stage: ScriptWorkflowStage,
    options: ScriptWorkflowOptions,
) -> bool:
    return options.mode == "through" or stage == options.target


def build_script_workflow_plan(
    snapshot: ScriptWorkflowSnapshot,
    options: ScriptWorkflowOptions,
) -> ScriptWorkflowPlan:
    """Build one factual DAG; persisted outputs, not prior task labels, win."""

    required_stages = _required_stages(options.target)
    selected_episodes = tuple(
        dict.fromkeys(options.episodes or snapshot.episode_numbers)
    )
    dynamic_episode_expansion = (
        options.target in {"identities", "scenes", "script"}
        and not selected_episodes
        and not options.episodes
    )
    definitions: list[
        tuple[ScriptWorkflowStage, int | None, tuple[str, ...], bool]
    ] = []

    if "ingest" in required_stages:
        definitions.append(
            ("ingest", None, (), _stage_is_executable("ingest", options))
        )
    if "characters" in required_stages:
        definitions.append(
            (
                "characters",
                None,
                (_node_id("ingest"),),
                _stage_is_executable("characters", options),
            )
        )
    if "episodes" in required_stages:
        definitions.append(
            (
                "episodes",
                None,
                (_node_id("characters"),),
                _stage_is_executable("episodes", options),
            )
        )

    for episode in selected_episodes:
        if "identities" in required_stages:
            definitions.append(
                (
                    "identities",
                    episode,
                    (_node_id("episodes"),),
                    _stage_is_executable("identities", options),
                )
            )
        if "scenes" in required_stages:
            definitions.append(
                (
                    "scenes",
                    episode,
                    (_node_id("episodes"),),
                    _stage_is_executable("scenes", options),
                )
            )
        if "script" in required_stages:
            definitions.append(
                (
                    "script",
                    episode,
                    (
                        _node_id("identities", episode),
                        _node_id("scenes", episode),
                    ),
                    _stage_is_executable("script", options),
                )
            )

    completion = {
        _node_id(stage, episode): _node_complete(stage, episode, snapshot)
        for stage, episode, _dependencies, _execute in definitions
    }
    nodes: list[ScriptWorkflowNode] = []
    for stage, episode, dependencies, execute in definitions:
        node_id = _node_id(stage, episode)
        task_status = snapshot.task_statuses.get(node_id, "").strip().lower()
        label = _STAGE_LABELS[stage]
        if episode is not None:
            label = f"第 {episode} 集 · {label}"
        blocked_reason = ""
        if completion[node_id]:
            status = "completed"
        elif task_status in _ACTIVE_TASK_STATUSES:
            status = "running"
        elif task_status == "completed":
            status = "blocked"
            blocked_reason = f"{label}任务已完成，但没有产出可用数据"
        elif stage == "ingest" and execute and not options.filename.strip():
            status = "blocked"
            blocked_reason = "尚未摄入原文，且没有提供已上传的剧本文档文件名"
        elif episode is not None and episode not in snapshot.episode_numbers:
            if completion.get(_node_id("episodes"), False):
                status = "blocked"
                blocked_reason = f"分集规划完成后仍不存在第 {episode} 集"
            else:
                status = "waiting" if options.mode == "through" else "blocked"
                if status == "blocked":
                    blocked_reason = f"第 {episode} 集不存在，请先完成分集规划"
        elif all(completion.get(dependency, False) for dependency in dependencies):
            status = "ready" if execute else "waiting"
        elif options.mode == "single" and execute:
            missing = [
                dependency
                for dependency in dependencies
                if not completion.get(dependency, False)
            ]
            status = "blocked"
            blocked_reason = "缺少前置节点：" + "、".join(missing)
        else:
            status = "waiting"
        nodes.append(
            ScriptWorkflowNode(
                node_id=node_id,
                stage=stage,
                label=label,
                episode=episode,
                dependencies=dependencies,
                execute=execute,
                status=status,
                blocked_reason=blocked_reason,
            )
        )

    target_nodes = [node for node in nodes if node.stage == options.target]
    target_complete = bool(target_nodes) and all(
        node.status == "completed" for node in nodes if node.execute
    )
    if (
        options.target in {"identities", "scenes", "script"}
        and dynamic_episode_expansion
    ):
        target_complete = False
    return ScriptWorkflowPlan(
        mode=options.mode,
        target=options.target,
        selected_episodes=selected_episodes,
        dynamic_episode_expansion=dynamic_episode_expansion,
        nodes=tuple(nodes),
        target_complete=target_complete,
    )


class ScriptWorkflowExecutor:
    def __init__(self, runtime: ScriptWorkflowRuntime) -> None:
        self._runtime = runtime

    async def execute(
        self,
        options: ScriptWorkflowOptions,
        *,
        timeout_seconds: float,
    ) -> dict[str, Any]:
        batches: list[list[str]] = []
        force_ingest_pending = options.rebuild
        for _iteration in range(256):
            snapshot = await self._runtime.snapshot(options)
            if force_ingest_pending:
                task_statuses = dict(snapshot.task_statuses)
                task_statuses.pop("ingest", None)
                snapshot = replace(
                    snapshot,
                    ingested=False,
                    task_statuses=task_statuses,
                )
            plan = build_script_workflow_plan(snapshot, options)
            self._runtime.report(plan, batches=batches)
            if plan.target_complete:
                return {
                    "graph": plan.as_dict(),
                    "batches": batches,
                    "completed_nodes": [
                        node.node_id
                        for node in plan.nodes
                        if node.status == "completed"
                    ],
                }

            running = [
                node
                for node in plan.nodes
                if node.execute and node.status == "running"
            ]
            ready = [
                node
                for node in plan.nodes
                if node.execute and node.status == "ready"
            ]
            candidates = running + ready
            if not candidates:
                blocked = [
                    node.blocked_reason
                    for node in plan.nodes
                    if node.execute and node.status == "blocked" and node.blocked_reason
                ]
                message = (
                    blocked[0] if blocked else "工作流没有可执行节点，请检查前置状态"
                )
                raise ScriptWorkflowBlocked(message, plan)

            batch = candidates[: options.max_parallel]
            batch_ids = [node.node_id for node in batch]
            self._runtime.report(
                plan,
                batches=batches,
                current_batch=batch_ids,
            )
            started = await asyncio.gather(
                *(self._runtime.start(node, options) for node in batch),
                return_exceptions=True,
            )
            start_errors = [item for item in started if isinstance(item, BaseException)]
            tickets = [
                item for item in started if isinstance(item, ScriptWorkflowTicket)
            ]
            if tickets:
                results = await asyncio.gather(
                    *(
                        self._runtime.wait(ticket, timeout_seconds=timeout_seconds)
                        for ticket in tickets
                    ),
                    return_exceptions=True,
                )
                wait_errors = [
                    item for item in results if isinstance(item, BaseException)
                ]
            else:
                wait_errors = []
            if start_errors or wait_errors:
                error = (start_errors or wait_errors)[0]
                raise RuntimeError(str(error)) from error
            batches.append(batch_ids)
            if "ingest" in batch_ids:
                force_ingest_pending = False

        snapshot = await self._runtime.snapshot(options)
        plan = build_script_workflow_plan(snapshot, options)
        raise ScriptWorkflowBlocked("工作流超过最大图迭代次数", plan)


__all__ = [
    "ScriptWorkflowBlocked",
    "ScriptWorkflowExecutor",
    "ScriptWorkflowMode",
    "ScriptWorkflowNode",
    "ScriptWorkflowOptions",
    "ScriptWorkflowPlan",
    "ScriptWorkflowRuntime",
    "ScriptWorkflowSnapshot",
    "ScriptWorkflowStage",
    "ScriptWorkflowTicket",
    "build_script_workflow_plan",
]
