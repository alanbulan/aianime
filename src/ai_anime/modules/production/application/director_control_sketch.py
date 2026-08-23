"""Director Control frame-to-sketch scheduling use cases."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ai_anime.modules.production.application.ports import (
    ProductionDirectorControlFrameSource,
    ProductionDirectorControlSketchScheduler,
)
from ai_anime.modules.production.application.sketch_generation import (
    SKETCH_GENERATION_TASK_TYPE,
)
from ai_anime.modules.project_workspace.public import ProjectContext

DIRECTOR_CONTROL_TO_SKETCH_TASK_KIND = "director_control_to_sketch"


@dataclass(frozen=True)
class GenerateDirectorControlSketchCommand:
    episode_num: int
    beat_num: int
    model: str
    model_selector: str = ""


@dataclass(frozen=True)
class DirectorControlFrameStatus:
    ready: bool
    scope: str
    data: dict[str, Any]


@dataclass(frozen=True)
class DirectorControlSketchTask:
    episode_num: int
    beat_num: int
    scope: str
    output_dir: str | Path
    state_dir: str | Path
    model: str
    model_selector: str = ""

    def backend_payload(self) -> dict[str, Any]:
        return {
            "task_kind": DIRECTOR_CONTROL_TO_SKETCH_TASK_KIND,
            "episode": self.episode_num,
            "beat_num": self.beat_num,
            "output_dir": str(self.output_dir),
            "state_dir": str(self.state_dir),
            "model": self.model,
            "model_selector": self.model_selector,
        }


@dataclass(frozen=True)
class DirectorControlSketchTaskReceipt:
    task_id: str
    task_key: str
    backend: str
    queue: str | None


@dataclass(frozen=True)
class ScheduledDirectorControlSketch:
    beat_num: int
    status: DirectorControlFrameStatus
    receipt: DirectorControlSketchTaskReceipt

    def as_dict(self) -> dict[str, Any]:
        return {
            "task_type": SKETCH_GENERATION_TASK_TYPE,
            "scope": self.status.scope,
            "task_id": self.receipt.task_id,
            "task_key": self.receipt.task_key,
            "backend": self.receipt.backend,
            "queue": self.receipt.queue,
            "message": (
                f"Beat {self.beat_num} Direct Render 转草图任务已进入队列"
            ),
            "data": self.status.data,
        }


class DirectorControlSketchUnavailable(Exception):
    def __init__(
        self,
        message: str,
        status: DirectorControlFrameStatus,
    ) -> None:
        super().__init__(message)
        self.status = status


class DirectorControlSketchUseCases:
    def __init__(
        self,
        frame_source: ProductionDirectorControlFrameSource,
        scheduler: ProductionDirectorControlSketchScheduler,
    ) -> None:
        self._frame_source = frame_source
        self._scheduler = scheduler

    async def generate(
        self,
        context: ProjectContext,
        command: GenerateDirectorControlSketchCommand,
    ) -> ScheduledDirectorControlSketch:
        status = self._frame_source.status(
            context,
            command.episode_num,
            command.beat_num,
        )
        model = str(command.model or "").strip()
        if not model:
            raise DirectorControlSketchUnavailable(
                "请先选择草图图片模型",
                status,
            )
        if not status.ready:
            raise DirectorControlSketchUnavailable(
                f"Beat {command.beat_num} 缺少 Direct Render combined.png，"
                "请先从 3GS / Freezone 导出",
                status,
            )

        task = DirectorControlSketchTask(
            episode_num=command.episode_num,
            beat_num=command.beat_num,
            scope=status.scope,
            output_dir=context.output_dir,
            state_dir=context.state_dir,
            model=model,
            model_selector=str(command.model_selector or "").strip(),
        )
        receipt = await self._scheduler.enqueue(context, task)
        return ScheduledDirectorControlSketch(
            beat_num=command.beat_num,
            status=status,
            receipt=receipt,
        )
