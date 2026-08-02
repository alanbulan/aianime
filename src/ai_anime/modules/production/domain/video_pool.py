"""Video pool domain entities."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime


@dataclass(frozen=True)
class VideoPoolEntry:
    id: str
    beat_num: int
    video_path: str
    generated_at: datetime
    duration: float = 5.0
    video_mode: str = "first_frame"
    video_model: str = ""
    prompt: str = ""


@dataclass
class VideoPool:
    episode: int
    generated_at: datetime = field(default_factory=datetime.now)
    videos: list[VideoPoolEntry] = field(default_factory=list)
    beat_assignments: dict[str, str] = field(default_factory=dict)

    def entry(self, pool_id: str) -> VideoPoolEntry | None:
        return next((item for item in self.videos if item.id == pool_id), None)
