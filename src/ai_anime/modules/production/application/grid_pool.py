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
