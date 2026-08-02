"""Selected-Beat Render and Sketch regeneration use cases."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Any

from ai_anime.modules.production.application.ports import (
    ProductionSelectedRegenerationPreparer,
    ProductionSelectedRegenerationScheduler,
)
from ai_anime.modules.project_workspace.public import ProjectContext

SELECTED_RENDER_REGEN_TASK_TYPE = "selected_regen"
SELECTED_SKETCH_REGEN_TASK_TYPE = "sketch_regen"


class SelectedRegenerationKind(str, Enum):
    RENDER = "render"
    SKETCH = "sketch"


def _task_type_for(kind: SelectedRegenerationKind) -> str:
    if kind is SelectedRegenerationKind.SKETCH:
        return SELECTED_SKETCH_REGEN_TASK_TYPE
    return SELECTED_RENDER_REGEN_TASK_TYPE


@dataclass(frozen=True)
class RegenerateSelectedBeatsCommand:
    kind: SelectedRegenerationKind
    episode_num: int
    beat_indices: tuple[int, ...]
    style: str | None = None
    mode_key: str = "1x1_2-3"
    image_generation_selection: str | None = None
    sketch_aspect_padding: bool | None = None


@dataclass(frozen=True)
class SelectedRegenerationTask:
    kind: SelectedRegenerationKind
    episode_num: int
    mode_key: str
    scope: str
    output_dir: str | Path
    config: dict[str, Any]

    @property
    def task_type(self) -> str:
        return _task_type_for(self.kind)

    def backend_payload(self) -> dict[str, Any]:
        return {
            "episode": self.episode_num,
            "mode_key": self.mode_key,
            "output_dir": str(self.output_dir),
            "config": {**self.config, "mode_key": self.mode_key},
        }


@dataclass(frozen=True)
class SelectedRegenerationTaskReceipt:
    task_id: str
    task_key: str
    backend: str
    queue: str | None


@dataclass(frozen=True)
class ScheduledSelectedRegeneration:
    kind: SelectedRegenerationKind
    episode_num: int
    scope: str
    receipt: SelectedRegenerationTaskReceipt

    def as_dict(self) -> dict[str, Any]:
        label = "草图" if self.kind is SelectedRegenerationKind.SKETCH else "画面"
        return {
            "task_type": _task_type_for(self.kind),
            "scope": self.scope,
            "task_id": self.receipt.task_id,
            "task_key": self.receipt.task_key,
            "backend": self.receipt.backend,
            "queue": self.receipt.queue,
            "message": (
                f"第 {self.episode_num} 集选中 Beats {label}再生已进入队列"
            ),
        }


class SelectedRegenerationRejected(Exception):
    pass


class SelectedRegenerationUseCases:
    def __init__(
        self,
        preparer: ProductionSelectedRegenerationPreparer,
        scheduler: ProductionSelectedRegenerationScheduler,
    ) -> None:
        self._preparer = preparer
        self._scheduler = scheduler

    async def regenerate(
        self,
        context: ProjectContext,
        command: RegenerateSelectedBeatsCommand,
    ) -> ScheduledSelectedRegeneration:
        task = await self._preparer.prepare(context, command)
        receipt = await self._scheduler.enqueue(context, task)
        return ScheduledSelectedRegeneration(
            kind=task.kind,
            episode_num=task.episode_num,
            scope=task.scope,
            receipt=receipt,
        )
