"""Video pool application use cases."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ai_anime.modules.production.application.ports import (
    ProductionProjectMediaUrls,
    ProductionVideoPoolStorage,
)
from ai_anime.modules.production.domain.video_pool import VideoPoolEntry
from ai_anime.modules.project_workspace.public import ProjectContext


@dataclass(frozen=True)
class AddGeneratedVideoCommand:
    episode_num: int
    beat_num: int
    source_video_path: str | Path
    output_dir: str | Path | None = None
    duration: float = 5.0
    video_mode: str = "first_frame"
    video_model: str = ""
    prompt: str = ""


@dataclass(frozen=True)
class VideoPoolEntryView:
    id: str
    beat_num: int
    video_path: str
    generated_at: str
    duration: float
    video_mode: str
    video_model: str
    prompt: str
    video_url: str

    @classmethod
    def from_entry(
        cls,
        entry: VideoPoolEntry,
        *,
        video_url: str,
    ) -> VideoPoolEntryView:
        return cls(
            id=entry.id,
            beat_num=entry.beat_num,
            video_path=entry.video_path,
            generated_at=entry.generated_at.isoformat(),
            duration=entry.duration,
            video_mode=entry.video_mode,
            video_model=entry.video_model,
            prompt=entry.prompt,
            video_url=video_url,
        )

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "beat_num": self.beat_num,
            "video_path": self.video_path,
            "generated_at": self.generated_at,
            "duration": self.duration,
            "video_mode": self.video_mode,
            "video_model": self.video_model,
            "prompt": self.prompt,
            "video_url": self.video_url,
        }


@dataclass(frozen=True)
class VideoPoolListing:
    episode: int
    videos: tuple[VideoPoolEntryView, ...]
    beat_assignments: dict[str, str]

    def as_dict(self) -> dict[str, Any]:
        return {
            "episode": self.episode,
            "videos": [item.as_dict() for item in self.videos],
            "beat_assignments": self.beat_assignments,
        }


@dataclass(frozen=True)
class SelectedVideoPoolEntry:
    beat_num: int
    pool_id: str
    video_url: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "beat_num": self.beat_num,
            "pool_id": self.pool_id,
            "video_url": self.video_url,
        }


@dataclass(frozen=True)
class DeletedVideoPoolEntry:
    pool_id: str

    def as_dict(self) -> dict[str, str]:
        return {"pool_id": self.pool_id}


class VideoPoolEntryUnavailable(ValueError):
    def __init__(self, pool_id: str) -> None:
        super().__init__(f"Pool entry '{pool_id}' not found or file missing")


class VideoPoolEntryInUse(ValueError):
    def __init__(self, pool_id: str) -> None:
        super().__init__(f"视频版本 '{pool_id}' 正在使用，请先切换到其他版本")


class VideoPoolUseCases:
    def __init__(
        self,
        storage: ProductionVideoPoolStorage,
        media_urls: ProductionProjectMediaUrls,
    ) -> None:
        self._storage = storage
        self._media_urls = media_urls

    def list_pool(
        self,
        context: ProjectContext,
        episode_num: int,
    ) -> VideoPoolListing | None:
        pool = self._storage.load(context, episode_num)
        if pool is None:
            return None

        episode_prefix = f"videos/beats/ep{episode_num:03d}"
        videos = tuple(
            VideoPoolEntryView.from_entry(
                entry,
                video_url=self._media_urls.build(
                    context,
                    f"{episode_prefix}/pool/{entry.video_path}",
                ),
            )
            for entry in pool.videos
        )
        return VideoPoolListing(
            episode=pool.episode,
            videos=videos,
            beat_assignments=dict(pool.beat_assignments),
        )

    def select(
        self,
        context: ProjectContext,
        episode_num: int,
        beat_num: int,
        pool_id: str,
    ) -> SelectedVideoPoolEntry:
        if not self._storage.assign(context, episode_num, beat_num, pool_id):
            raise VideoPoolEntryUnavailable(pool_id)

        relative_path = f"videos/beats/ep{episode_num:03d}/beat_{beat_num:02d}.mp4"
        return SelectedVideoPoolEntry(
            beat_num=beat_num,
            pool_id=pool_id,
            video_url=self._media_urls.build(context, relative_path),
        )

    def add_generated(
        self,
        context: ProjectContext,
        command: AddGeneratedVideoCommand,
    ) -> VideoPoolEntry:
        return self._storage.add(context, command)

    def delete(
        self,
        context: ProjectContext,
        episode_num: int,
        pool_id: str,
    ) -> DeletedVideoPoolEntry:
        outcome = self._storage.delete(context, episode_num, pool_id)
        if outcome == "assigned":
            raise VideoPoolEntryInUse(pool_id)
        if outcome != "deleted":
            raise VideoPoolEntryUnavailable(pool_id)
        return DeletedVideoPoolEntry(pool_id=pool_id)
