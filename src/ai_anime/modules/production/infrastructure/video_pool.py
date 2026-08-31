"""Local video pool persistence and media URL adapters."""

from __future__ import annotations

import shutil
from dataclasses import asdict
from datetime import datetime
from pathlib import Path

from pydantic import BaseModel, Field

from ai_anime.modules.production.application.video_pool import (
    AddGeneratedVideoCommand,
)
from ai_anime.modules.production.domain.video_pool import VideoPool, VideoPoolEntry
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.shared import project_media
from ai_anime.shared.utils.state_index_files import (
    index_file_lock,
    resolve_state_index_path,
    write_json_atomic,
)

_VIDEO_POOL_INDEX_FILENAME = "video_pool_index.json"


class _StoredVideoPoolEntry(BaseModel):
    id: str
    beat_num: int
    video_path: str
    generated_at: datetime
    duration: float = 5.0
    video_mode: str = "first_frame"
    video_model: str = ""
    prompt: str = ""

    def to_domain(self) -> VideoPoolEntry:
        return VideoPoolEntry(**self.model_dump())


class _StoredVideoPool(BaseModel):
    episode: int
    generated_at: datetime = Field(default_factory=datetime.now)
    videos: list[_StoredVideoPoolEntry] = Field(default_factory=list)
    beat_assignments: dict[str, str] = Field(default_factory=dict)

    @classmethod
    def from_domain(cls, pool: VideoPool) -> _StoredVideoPool:
        return cls(
            episode=pool.episode,
            generated_at=pool.generated_at,
            videos=[
                _StoredVideoPoolEntry(**asdict(entry)) for entry in pool.videos
            ],
            beat_assignments=pool.beat_assignments,
        )

    def to_domain(self) -> VideoPool:
        return VideoPool(
            episode=self.episode,
            generated_at=self.generated_at,
            videos=[entry.to_domain() for entry in self.videos],
            beat_assignments=dict(self.beat_assignments),
        )


class LocalVideoPoolStorage:
    @staticmethod
    def _episode_dir(
        context: ProjectContext,
        episode_num: int,
        output_dir: str | Path | None = None,
    ) -> Path:
        return (
            Path(output_dir or context.output_dir)
            / "videos"
            / "beats"
            / f"ep{episode_num:03d}"
        )

    @staticmethod
    def _index_path(episode_dir: Path) -> Path:
        return resolve_state_index_path(episode_dir, _VIDEO_POOL_INDEX_FILENAME)

    @staticmethod
    def _load_unlocked(index_path: Path) -> VideoPool | None:
        if not index_path.exists():
            return None
        try:
            stored = _StoredVideoPool.model_validate_json(
                index_path.read_text(encoding="utf-8")
            )
        except (OSError, ValueError):
            return None
        return stored.to_domain()

    @staticmethod
    def _save_unlocked(pool: VideoPool, index_path: Path) -> None:
        stored = _StoredVideoPool.from_domain(pool)
        write_json_atomic(index_path, stored.model_dump(mode="json"))

    def load(
        self,
        context: ProjectContext,
        episode_num: int,
    ) -> VideoPool | None:
        episode_dir = self._episode_dir(context, episode_num)
        index_path = self._index_path(episode_dir)
        with index_file_lock(index_path):
            return self._load_unlocked(index_path)

    def add(
        self,
        context: ProjectContext,
        command: AddGeneratedVideoCommand,
    ) -> VideoPoolEntry:
        episode_dir = self._episode_dir(
            context,
            command.episode_num,
            command.output_dir,
        )
        pool_dir = episode_dir / "pool"
        pool_dir.mkdir(parents=True, exist_ok=True)

        generated_at = datetime.now()
        entry_id = (
            f"beat_{command.beat_num:02d}_{generated_at:%Y%m%d_%H%M%S_%f}"
        )
        pool_filename = f"{entry_id}.mp4"
        shutil.copy2(Path(command.source_video_path), pool_dir / pool_filename)

        entry = VideoPoolEntry(
            id=entry_id,
            beat_num=command.beat_num,
            video_path=pool_filename,
            generated_at=generated_at,
            duration=command.duration,
            video_mode=command.video_mode,
            video_model=command.video_model,
            prompt=command.prompt,
        )
        index_path = self._index_path(episode_dir)
        with index_file_lock(index_path):
            pool = self._load_unlocked(index_path) or VideoPool(
                episode=command.episode_num
            )
            pool.videos.append(entry)
            pool.beat_assignments[str(command.beat_num)] = entry.id
            self._save_unlocked(pool, index_path)
        return entry

    def assign(
        self,
        context: ProjectContext,
        episode_num: int,
        beat_num: int,
        pool_id: str,
    ) -> bool:
        episode_dir = self._episode_dir(context, episode_num)
        index_path = self._index_path(episode_dir)
        with index_file_lock(index_path):
            pool = self._load_unlocked(index_path)
            if pool is None:
                return False

            entry = pool.entry(pool_id)
            if entry is None:
                return False
            pool_path = episode_dir / "pool" / entry.video_path
            if not pool_path.exists():
                return False

            shutil.copy2(pool_path, episode_dir / f"beat_{beat_num:02d}.mp4")
            pool.beat_assignments[str(beat_num)] = pool_id
            self._save_unlocked(pool, index_path)
        return True

    def delete(
        self,
        context: ProjectContext,
        episode_num: int,
        pool_id: str,
    ) -> str:
        episode_dir = self._episode_dir(context, episode_num)
        index_path = self._index_path(episode_dir)
        with index_file_lock(index_path):
            pool = self._load_unlocked(index_path)
            if pool is None:
                return "missing"
            entry = pool.entry(pool_id)
            if entry is None:
                return "missing"
            if pool_id in {
                str(assignment or "").strip()
                for assignment in pool.beat_assignments.values()
            }:
                return "assigned"

            pool_dir = (episode_dir / "pool").resolve()
            video_path = (pool_dir / entry.video_path).resolve()
            if video_path == pool_dir or pool_dir not in video_path.parents:
                return "missing"
            if not video_path.is_file():
                return "missing"

            video_path.unlink()
            pool.videos = [item for item in pool.videos if item.id != pool_id]
            self._save_unlocked(pool, index_path)
        return "deleted"


class ProjectStaticMediaUrls:
    def build(
        self,
        context: ProjectContext,
        relative_path: str,
    ) -> str:
        return project_media.make_project_static_url(
            context,
            relative_path,
            local_path=Path(context.output_dir) / relative_path,
        )
