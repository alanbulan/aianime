"""Episode sketch-grid generation scheduling use cases."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ai_anime.modules.production.application.ports import (
    ProductionSketchGenerationPreparer,
    ProductionSketchGenerationScheduler,
)
from ai_anime.modules.production.domain.sketch_generation import (
    GridShape,
    sketch_grid_labels,
)
from ai_anime.modules.project_workspace.public import ProjectContext

SKETCH_GENERATION_TASK_TYPE = "sketch_generation"


@dataclass(frozen=True)
class GenerateSketchesCommand:
    episode_num: int
    grid_index: int = 0
    style: str | None = None
    sketch_scene_grouping: bool = True
    aspect_ratio: str = "2:3"
    image_generation_selection: str | None = None
    replace_existing: bool = False


@dataclass(frozen=True)
class SketchGenerationTask:
    episode_num: int
    grid_index: int
    output_dir: str | Path
    config: dict[str, Any]

    @property
    def scope(self) -> str:
        return f"grid_{self.grid_index}"

    def backend_payload(self) -> dict[str, Any]:
        return {
            "episode": self.episode_num,
            "output_dir": str(self.output_dir),
            "config": {**self.config, "grid_index": self.grid_index},
        }


@dataclass(frozen=True)
class PreparedSketchGeneration:
    episode_num: int
    requested_grid_index: int
    grid_plan: tuple[GridShape, ...]
    tasks: tuple[SketchGenerationTask, ...]


@dataclass(frozen=True)
class SketchGenerationTaskReceipt:
    grid_index: int
    scope: str
    task_id: str
    task_key: str
    backend: str
    queue: str | None

    def as_dict(self) -> dict[str, Any]:
        return {
            "grid_index": self.grid_index,
            "scope": self.scope,
            "task_id": self.task_id,
            "task_key": self.task_key,
            "backend": self.backend,
            "queue": self.queue,
        }


@dataclass(frozen=True)
class ScheduledSketchGeneration:
    episode_num: int
    requested_grid_index: int
    grid_plan: tuple[GridShape, ...]
    receipts: tuple[SketchGenerationTaskReceipt, ...]

    def as_dict(self) -> dict[str, Any]:
        first = self.receipts[0]
        if self.requested_grid_index == -1:
            tasks = [receipt.as_dict() for receipt in self.receipts]
            return {
                "task_type": SKETCH_GENERATION_TASK_TYPE,
                "backend": first.backend,
                "data": {
                    "dispatched": len(tasks),
                    "tasks": tasks,
                    "scopes": [receipt.scope for receipt in self.receipts],
                },
                "message": (
                    f"第 {self.episode_num} 集全集草图生成已进入队列 "
                    f"({sketch_grid_labels(self.grid_plan)})"
                ),
            }
        return {
            "task_type": SKETCH_GENERATION_TASK_TYPE,
            "backend": first.backend,
            "task_id": first.task_id,
            "task_key": first.task_key,
            "queue": first.queue,
            "message": (
                f"第 {self.episode_num} 集草图生成已进入队列 "
                f"(网格 {self.requested_grid_index})"
            ),
        }


class SketchGenerationRejected(Exception):
    pass


class SketchGenerationUseCases:
    def __init__(
        self,
        preparer: ProductionSketchGenerationPreparer,
        scheduler: ProductionSketchGenerationScheduler,
    ) -> None:
        self._preparer = preparer
        self._scheduler = scheduler

    async def generate(
        self,
        context: ProjectContext,
        command: GenerateSketchesCommand,
    ) -> ScheduledSketchGeneration:
        prepared = await self._preparer.prepare(context, command)
        receipts: list[SketchGenerationTaskReceipt] = []
        for task in prepared.tasks:
            receipts.append(await self._scheduler.enqueue(context, task))
        return ScheduledSketchGeneration(
            episode_num=prepared.episode_num,
            requested_grid_index=prepared.requested_grid_index,
            grid_plan=prepared.grid_plan,
            receipts=tuple(receipts),
        )
