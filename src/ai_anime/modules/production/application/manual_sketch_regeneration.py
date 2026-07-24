"""Missing manual-shot Sketch regeneration use cases."""

from __future__ import annotations

from dataclasses import dataclass

from ai_anime.modules.production.application.ports import (
    ProductionManualSketchRegenerationPreparer,
    ProductionSelectedRegenerationScheduler,
)
from ai_anime.modules.production.application.selected_regeneration import (
    SELECTED_SKETCH_REGEN_TASK_TYPE,
    SelectedRegenerationTask,
    SelectedRegenerationTaskReceipt,
)
from ai_anime.modules.project_workspace.public import ProjectContext


@dataclass(frozen=True)
class GenerateMissingManualSketchesCommand:
    episode_num: int


@dataclass(frozen=True)
class ManualSketchRegenerationSegment:
    beat_numbers: tuple[int, ...]
    task: SelectedRegenerationTask


@dataclass(frozen=True)
class PreparedManualSketchRegeneration:
    episode_num: int
    segments: tuple[ManualSketchRegenerationSegment, ...]


@dataclass(frozen=True)
class ScheduledManualSketchSegment:
    beat_numbers: tuple[int, ...]
    scope: str
    receipt: SelectedRegenerationTaskReceipt


@dataclass(frozen=True)
class ScheduledManualSketchRegeneration:
    episode_num: int
    segments: tuple[ScheduledManualSketchSegment, ...]

    def as_dict(self) -> dict:
        if not self.segments:
            return {
                "ok": True,
                "data": {"dispatched": 0, "scopes": [], "segments": []},
                "message": "没有缺草图的手工分镜",
            }

        return {
            "ok": True,
            "task_type": SELECTED_SKETCH_REGEN_TASK_TYPE,
            "data": {
                "dispatched": len(self.segments),
                "scopes": [segment.scope for segment in self.segments],
                "segments": [list(segment.beat_numbers) for segment in self.segments],
            },
            "message": f"已启动 {len(self.segments)} 组新增分镜草图生成",
        }


class ManualSketchRegenerationRejected(Exception):
    pass


class ManualSketchRegenerationUseCases:
    def __init__(
        self,
        preparer: ProductionManualSketchRegenerationPreparer,
        scheduler: ProductionSelectedRegenerationScheduler,
    ) -> None:
        self._preparer = preparer
        self._scheduler = scheduler

    async def generate(
        self,
        context: ProjectContext,
        command: GenerateMissingManualSketchesCommand,
    ) -> ScheduledManualSketchRegeneration:
        prepared = await self._preparer.prepare(context, command)
        scheduled: list[ScheduledManualSketchSegment] = []
        for segment in prepared.segments:
            receipt = await self._scheduler.enqueue(context, segment.task)
            scheduled.append(
                ScheduledManualSketchSegment(
                    beat_numbers=segment.beat_numbers,
                    scope=segment.task.scope,
                    receipt=receipt,
                )
            )
        return ScheduledManualSketchRegeneration(
            episode_num=prepared.episode_num,
            segments=tuple(scheduled),
        )
