"""Episode grid image-pool use cases."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from ai_anime.modules.production.application.ports import ProductionGridPoolGateway
from ai_anime.modules.project_workspace.public import ProjectContext


@dataclass(frozen=True)
class GridPoolImageView:
    id: str
    mode: str
    grid_index: int
    cell_index: int
    grid_path: str
    cell_path: str | None
    row: int
    col: int
    original_beat: int
    generated_at: str | None
    type: str
    content_hash: str | None
    beat_content_hash: str | None
    cell_url: str
    grid_url: str
    stale: bool

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "mode": self.mode,
            "grid_index": self.grid_index,
            "cell_index": self.cell_index,
            "grid_path": self.grid_path,
            "cell_path": self.cell_path,
            "row": self.row,
            "col": self.col,
            "original_beat": self.original_beat,
            "generated_at": self.generated_at,
            "type": self.type,
            "content_hash": self.content_hash,
            "beat_content_hash": self.beat_content_hash,
            "cell_url": self.cell_url,
            "grid_url": self.grid_url,
            "stale": self.stale,
        }


@dataclass(frozen=True)
class GridPoolListing:
    episode: int
    modes: dict[str, dict[str, Any]]
    images: tuple[GridPoolImageView, ...]
    beat_assignments: dict[str, str]

    def as_dict(self) -> dict[str, Any]:
        return {
            "episode": self.episode,
            "modes": self.modes,
            "images": [image.as_dict() for image in self.images],
            "beat_assignments": self.beat_assignments,
        }


@dataclass(frozen=True)
class BeatSketchCandidateView:
    id: str
    type: str
    mode: str
    cell_path: str
    url: str
    grid_path: str
    grid_index: int
    cell_index: int
    row: int
    col: int
    original_beat: int
    generated_at: str
    stale: bool

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "type": self.type,
            "mode": self.mode,
            "cell_path": self.cell_path,
            "url": self.url,
            "grid_path": self.grid_path,
            "grid_index": self.grid_index,
            "cell_index": self.cell_index,
            "row": self.row,
            "col": self.col,
            "original_beat": self.original_beat,
            "generated_at": self.generated_at,
            "stale": self.stale,
        }


@dataclass(frozen=True)
class BeatSketchCandidates:
    episode: int
    beat: int
    current_sketch_url: str
    candidates: tuple[BeatSketchCandidateView, ...]

    def as_dict(self) -> dict[str, Any]:
        return {
            "episode": self.episode,
            "beat": self.beat,
            "current_sketch_url": self.current_sketch_url,
            "candidate_count": len(self.candidates),
            "candidates": [candidate.as_dict() for candidate in self.candidates],
        }


@dataclass(frozen=True)
class SelectGridPoolImageCommand:
    episode_num: int
    beat_num: int
    pool_id: str
    force: bool = False


@dataclass(frozen=True)
class SelectedGridPoolImage:
    beat_num: int
    pool_id: str
    image_type: str
    sketch_url: str | None = None
    frame_url: str | None = None

    def as_dict(self) -> dict[str, Any]:
        data: dict[str, Any] = {
            "beat_num": self.beat_num,
            "pool_id": self.pool_id,
            "image_type": self.image_type,
        }
        if self.sketch_url is not None:
            data["sketch_url"] = self.sketch_url
        if self.frame_url is not None:
            data["frame_url"] = self.frame_url
        return data


@dataclass(frozen=True)
class UploadBeatPoolImageCommand:
    episode_num: int
    beat_num: int
    content: bytes
    image_type: str


@dataclass(frozen=True)
class UploadedBeatPoolImage:
    beat_num: int
    pool_id: str
    sketch_url: str | None = None
    frame_url: str | None = None

    def as_dict(self) -> dict[str, Any]:
        data: dict[str, Any] = {
            "beat_num": self.beat_num,
            "pool_id": self.pool_id,
        }
        if self.sketch_url is not None:
            data["sketch_url"] = self.sketch_url
        if self.frame_url is not None:
            data["frame_url"] = self.frame_url
        return data


@dataclass(frozen=True)
class RebuiltGridPool:
    episode: int
    image_count: int
    mode_count: int

    def as_dict(self) -> dict[str, int]:
        return {
            "episode": self.episode,
            "image_count": self.image_count,
            "mode_count": self.mode_count,
        }


class GridPoolSelectionRejected(ValueError):
    pass


class GridPoolImageStale(GridPoolSelectionRejected):
    def __init__(self) -> None:
        super().__init__(
            "该草图已过期，请先重新生成。如确认仍要使用，请传 force=true。"
        )


class GridPoolUploadRejected(ValueError):
    pass


class GridPoolUseCases:
    def __init__(self, gateway: ProductionGridPoolGateway) -> None:
        self._gateway = gateway

    async def list_pool(
        self,
        context: ProjectContext,
        episode_num: int,
    ) -> GridPoolListing | None:
        return await self._gateway.list_pool(context, episode_num)

    def rebuild(
        self,
        context: ProjectContext,
        episode_num: int,
    ) -> RebuiltGridPool:
        return self._gateway.rebuild(context, episode_num)

    async def sketch_candidates(
        self,
        context: ProjectContext,
        episode_num: int,
        beat_num: int,
    ) -> BeatSketchCandidates:
        return await self._gateway.sketch_candidates(
            context,
            episode_num,
            beat_num,
        )

    async def select(
        self,
        context: ProjectContext,
        command: SelectGridPoolImageCommand,
    ) -> SelectedGridPoolImage:
        return await self._gateway.select(context, command)

    def upload(
        self,
        context: ProjectContext,
        command: UploadBeatPoolImageCommand,
    ) -> UploadedBeatPoolImage:
        return self._gateway.upload(context, command)
