"""Global episode video-prompt optimization scheduling use cases."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ai_anime.modules.production.application.ports import (
    ProductionEpisodeSketchCatalog,
    ProductionGlobalVideoOptimizationScheduler,
    ProductionGlobalVideoOptimizationSource,
)
from ai_anime.modules.project_workspace.public import ProjectContext

GLOBAL_VIDEO_OPTIMIZATION_TASK_TYPE = "global_optimize_video"


@dataclass(frozen=True)
class OptimizeEpisodeVideoCommand:
    episode_num: int
    language: str = "en"


@dataclass(frozen=True)
class GlobalVideoOptimizationMaterials:
    beats: list[dict[str, Any]]
    characters: list[dict[str, Any]]


@dataclass(frozen=True)
class GlobalVideoOptimizationTask:
    episode_num: int
    beats: list[dict[str, Any]]
    characters: list[dict[str, Any]]
    output_dir: str | Path
    language: str

    def backend_payload(self) -> dict[str, Any]:
        return {
            "episode": self.episode_num,
            "beats": self.beats,
            "characters": self.characters,
            "output_dir": str(self.output_dir),
            "language": self.language,
        }


@dataclass(frozen=True)
class GlobalVideoOptimizationTaskReceipt:
    task_id: str
    task_key: str
    backend: str
    queue: str | None


@dataclass(frozen=True)
class ScheduledGlobalVideoOptimization:
    task_id: str
    task_key: str
    backend: str
    queue: str | None
    episode_num: int

    @classmethod
    def from_receipt(
        cls,
        receipt: GlobalVideoOptimizationTaskReceipt,
        *,
        episode_num: int,
    ) -> ScheduledGlobalVideoOptimization:
        return cls(
            task_id=receipt.task_id,
            task_key=receipt.task_key,
            backend=receipt.backend,
            queue=receipt.queue,
            episode_num=episode_num,
        )

    def as_dict(self) -> dict[str, Any]:
        return {
            "task_type": GLOBAL_VIDEO_OPTIMIZATION_TASK_TYPE,
            "task_id": self.task_id,
            "task_key": self.task_key,
            "backend": self.backend,
            "queue": self.queue,
            "message": f"第 {self.episode_num} 集全局视频优化已进入队列",
        }


class GlobalVideoOptimizationBeatsMissing(ValueError):
    def __init__(self, episode_num: int) -> None:
        super().__init__(f"No beats found for episode {episode_num}")


class GlobalVideoOptimizationSketchesMissing(ValueError):
    def __init__(self) -> None:
        super().__init__("没有草图，请先生成草图再执行全局优化")


class GlobalVideoOptimizationUseCases:
    def __init__(
        self,
        source: ProductionGlobalVideoOptimizationSource,
        sketches: ProductionEpisodeSketchCatalog,
        scheduler: ProductionGlobalVideoOptimizationScheduler,
    ) -> None:
        self._source = source
        self._sketches = sketches
        self._scheduler = scheduler

    async def schedule(
        self,
        context: ProjectContext,
        command: OptimizeEpisodeVideoCommand,
    ) -> ScheduledGlobalVideoOptimization:
        materials = await self._source.load(context, command.episode_num)
        if not materials.beats:
            raise GlobalVideoOptimizationBeatsMissing(command.episode_num)
        if not self._sketches.has_any(context, command.episode_num):
            raise GlobalVideoOptimizationSketchesMissing

        receipt = await self._scheduler.enqueue(
            context,
            GlobalVideoOptimizationTask(
                episode_num=command.episode_num,
                beats=materials.beats,
                characters=materials.characters,
                output_dir=context.output_dir,
                language=command.language,
            ),
        )
        return ScheduledGlobalVideoOptimization.from_receipt(
            receipt,
            episode_num=command.episode_num,
        )
