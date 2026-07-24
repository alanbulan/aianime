"""Single Render-grid regeneration scheduling use cases."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ai_anime.modules.production.application.ports import (
    ProductionGridRegenerationPreparer,
    ProductionGridRegenerationScheduler,
)
from ai_anime.modules.project_workspace.public import ProjectContext

GRID_REGENERATION_TASK_TYPE = "grid_regenerate"


@dataclass(frozen=True)
class RegenerateGridCommand:
    episode_num: int
    grid_index: int
    style: str | None = None
    model: str = "nanobanana"
    scene_grouping: bool = False
    character_grouping: bool = False
    image_generation_selection: str | None = None
    sketch_aspect_padding: bool | None = None


@dataclass(frozen=True)
class GridRegenerationTask:
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
            "grid_index": self.grid_index,
            "output_dir": str(self.output_dir),
            "config": self.config,
        }


@dataclass(frozen=True)
class GridRegenerationTaskReceipt:
    scope: str
    task_id: str
    task_key: str
    backend: str
    queue: str | None


@dataclass(frozen=True)
class ScheduledGridRegeneration:
    episode_num: int
    grid_index: int
    receipt: GridRegenerationTaskReceipt

    def as_dict(self) -> dict[str, Any]:
        return {
            "task_type": GRID_REGENERATION_TASK_TYPE,
            "scope": self.receipt.scope,
            "task_id": self.receipt.task_id,
            "task_key": self.receipt.task_key,
            "backend": self.receipt.backend,
            "queue": self.receipt.queue,
            "message": (
                f"第 {self.episode_num} 集网格 {self.grid_index} "
                "重新生成已进入队列"
            ),
        }


class GridRegenerationRejected(Exception):
    pass


class GridRegenerationUseCases:
    def __init__(
        self,
        preparer: ProductionGridRegenerationPreparer,
        scheduler: ProductionGridRegenerationScheduler,
    ) -> None:
        self._preparer = preparer
        self._scheduler = scheduler

    async def regenerate(
        self,
        context: ProjectContext,
        command: RegenerateGridCommand,
    ) -> ScheduledGridRegeneration:
        task = await self._preparer.prepare(context, command)
        receipt = await self._scheduler.enqueue(context, task)
        return ScheduledGridRegeneration(
            episode_num=task.episode_num,
            grid_index=task.grid_index,
            receipt=receipt,
        )
