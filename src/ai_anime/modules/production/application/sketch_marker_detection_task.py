"""Project task scheduling for sketch identity detection."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol

from ai_anime.modules.project_workspace.public import ProjectContext

AI_IDENTITY_DETECTION_TASK_TYPE = "ai_identity_detection"


@dataclass(frozen=True)
class ScheduleSketchMarkerDetectionCommand:
    episode_num: int


@dataclass(frozen=True)
class SketchMarkerDetectionTaskReceipt:
    task_id: str
    task_key: str
    backend: str
    queue: str | None


class SketchMarkerDetectionTaskScheduler(Protocol):
    async def enqueue(
        self,
        context: ProjectContext,
        command: ScheduleSketchMarkerDetectionCommand,
    ) -> SketchMarkerDetectionTaskReceipt: ...


@dataclass(frozen=True)
class ScheduledSketchMarkerDetection:
    receipt: SketchMarkerDetectionTaskReceipt
    episode_num: int

    def as_dict(self) -> dict[str, Any]:
        return {
            "task_type": AI_IDENTITY_DETECTION_TASK_TYPE,
            "task_id": self.receipt.task_id,
            "task_key": self.receipt.task_key,
            "backend": self.receipt.backend,
            "queue": self.receipt.queue,
            "message": f"第 {self.episode_num} 集 AI 角色检测已进入队列",
        }


class SketchMarkerDetectionTaskUseCases:
    def __init__(self, scheduler: SketchMarkerDetectionTaskScheduler) -> None:
        self._scheduler = scheduler

    async def schedule(
        self,
        context: ProjectContext,
        command: ScheduleSketchMarkerDetectionCommand,
    ) -> ScheduledSketchMarkerDetection:
        receipt = await self._scheduler.enqueue(context, command)
        return ScheduledSketchMarkerDetection(
            receipt=receipt,
            episode_num=command.episode_num,
        )


__all__ = [
    "AI_IDENTITY_DETECTION_TASK_TYPE",
    "ScheduleSketchMarkerDetectionCommand",
    "ScheduledSketchMarkerDetection",
    "SketchMarkerDetectionTaskReceipt",
    "SketchMarkerDetectionTaskScheduler",
    "SketchMarkerDetectionTaskUseCases",
]
