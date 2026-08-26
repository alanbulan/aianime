"""Sketch edit execution scheduling use cases."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ai_anime.modules.production.application.ports import (
    ProductionSketchEditExecutionScheduler,
)
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.modules.task_execution.public import task_config_scope

SKETCH_EDIT_EXECUTION_TASK_TYPE = "sketch_edit_execute"


@dataclass(frozen=True)
class SketchEditExecutionTask:
    episode_num: int
    project_dir: str | Path
    labels_name: str
    model: str
    model_selector: str = ""

    @property
    def scope(self) -> str:
        return task_config_scope(
            "edit_execute",
            {"labels_name": self.labels_name},
        )

    def backend_payload(self) -> dict[str, Any]:
        payload = {
            "episode": self.episode_num,
            "project_dir": str(self.project_dir),
            "labels_name": self.labels_name,
            "model": self.model,
        }
        if self.model_selector:
            payload["model_selector"] = self.model_selector
        return payload


@dataclass(frozen=True)
class SketchEditExecutionTaskReceipt:
    scope: str
    task_id: str
    task_key: str
    backend: str
    queue: str | None


@dataclass(frozen=True)
class ScheduledSketchEditExecution:
    episode_num: int
    receipt: SketchEditExecutionTaskReceipt

    def as_dict(self) -> dict[str, Any]:
        return {
            "task_type": SKETCH_EDIT_EXECUTION_TASK_TYPE,
            "scope": self.receipt.scope,
            "task_id": self.receipt.task_id,
            "task_key": self.receipt.task_key,
            "backend": self.receipt.backend,
            "queue": self.receipt.queue,
            "message": (
                f"第 {self.episode_num} 集 sketch edit execute 任务已进入队列"
            ),
        }


class SketchEditExecutionUseCases:
    def __init__(self, scheduler: ProductionSketchEditExecutionScheduler) -> None:
        self._scheduler = scheduler

    async def start(
        self,
        context: ProjectContext,
        task: SketchEditExecutionTask,
    ) -> ScheduledSketchEditExecution:
        receipt = await self._scheduler.enqueue(context, task)
        return ScheduledSketchEditExecution(
            episode_num=task.episode_num,
            receipt=receipt,
        )
