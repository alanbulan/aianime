"""Episode video composition and final-video application use cases."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ai_anime.modules.production.application.ports import (
    ProductionEpisodeBeatSource,
    ProductionEpisodeVideoScheduler,
    ProductionFinalVideoCatalog,
)
from ai_anime.modules.project_workspace.public import ProjectContext


@dataclass(frozen=True)
class ComposeEpisodeVideoCommand:
    episode_num: int
    add_subtitles: bool = True
    add_bgm: bool = False
    resolution: str = "720x1280"


@dataclass(frozen=True)
class EpisodeVideoCompositionTask:
    episode_num: int
    output_dir: str | Path
    beats: list[dict[str, Any]]
    add_subtitles: bool
    add_bgm: bool
    resolution: str

    def backend_payload(self) -> dict[str, Any]:
        return {
            "beats": self.beats,
            "add_subtitles": self.add_subtitles,
            "add_bgm": self.add_bgm,
            "episode": self.episode_num,
            "output_dir": str(self.output_dir),
            "resolution": self.resolution,
        }


@dataclass(frozen=True)
class EpisodeVideoTaskReceipt:
    task_id: str
    task_key: str
    backend: str
    queue: str | None


@dataclass(frozen=True)
class ScheduledEpisodeVideo:
    task_id: str
    task_key: str
    backend: str
    queue: str | None
    episode_num: int

    @classmethod
    def from_receipt(
        cls,
        receipt: EpisodeVideoTaskReceipt,
        *,
        episode_num: int,
    ) -> ScheduledEpisodeVideo:
        return cls(
            task_id=receipt.task_id,
            task_key=receipt.task_key,
            backend=receipt.backend,
            queue=receipt.queue,
            episode_num=episode_num,
        )

    def as_dict(self) -> dict[str, Any]:
        return {
            "task_type": "compose_episode",
            "task_id": self.task_id,
            "task_key": self.task_key,
            "backend": self.backend,
            "queue": self.queue,
            "message": f"第 {self.episode_num} 集成片合成已进入队列",
        }


@dataclass(frozen=True)
class FinalEpisodeVideoStatus:
    exists: bool
    filename: str
    video_url: str | None = None

    def as_dict(self) -> dict[str, Any]:
        data: dict[str, Any] = {
            "exists": self.exists,
            "filename": self.filename,
        }
        if self.video_url is not None:
            data["video_url"] = self.video_url
        return data


class EpisodeBeatsMissing(ValueError):
    def __init__(self, episode_num: int) -> None:
        super().__init__(f"No beats found for episode {episode_num}")


class EpisodeVideoUseCases:
    def __init__(
        self,
        beat_source: ProductionEpisodeBeatSource,
        scheduler: ProductionEpisodeVideoScheduler,
        final_videos: ProductionFinalVideoCatalog,
    ) -> None:
        self._beat_source = beat_source
        self._scheduler = scheduler
        self._final_videos = final_videos

    async def compose(
        self,
        context: ProjectContext,
        command: ComposeEpisodeVideoCommand,
    ) -> ScheduledEpisodeVideo:
        beats = await self._beat_source.for_episode(context, command.episode_num)
        if not beats:
            raise EpisodeBeatsMissing(command.episode_num)

        receipt = await self._scheduler.enqueue(
            context,
            EpisodeVideoCompositionTask(
                episode_num=command.episode_num,
                output_dir=context.output_dir,
                beats=beats,
                add_subtitles=command.add_subtitles,
                add_bgm=command.add_bgm,
                resolution=command.resolution,
            ),
        )
        return ScheduledEpisodeVideo.from_receipt(
            receipt,
            episode_num=command.episode_num,
        )

    def final_status(
        self,
        context: ProjectContext,
        episode_num: int,
    ) -> FinalEpisodeVideoStatus:
        return self._final_videos.status(context, episode_num)
