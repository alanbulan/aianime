"""Episode grid image-pool use cases."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ai_anime.modules.production.application.ports import ProductionGridPoolGateway
from ai_anime.modules.project_workspace.public import ProjectContext


def parse_grid_beat_numbers(raw: str | None) -> tuple[int, ...]:
    if not raw:
        return ()
    text = raw.strip()
    if not text:
        return ()
    if text.startswith("["):
        parsed = json.loads(text)
        values = parsed if isinstance(parsed, list) else []
    else:
        values = re.split(r"[,;\s]+", text)
    beat_numbers: list[int] = []
    seen: set[int] = set()
    for value in values:
        if value in ("", None):
            continue
        beat_num = int(value)
        if beat_num <= 0 or beat_num in seen:
            continue
        beat_numbers.append(beat_num)
        seen.add(beat_num)
    return tuple(beat_numbers)


def _grid_upload_extension(filename: str | None) -> str:
    extension = Path(filename or "").suffix.lower().lstrip(".")
    if extension not in {"png", "jpg", "jpeg", "webp"}:
        return "png"
    return "jpg" if extension == "jpeg" else extension


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
class UploadGridImageCommand:
    episode_num: int
    grid_index: int
    filename: str | None
    content: bytes
    grid_type: str = "render"
    mode_key: str = ""
    beat_numbers: str | None = ""


@dataclass(frozen=True)
class PersistGridImageCommand:
    episode_num: int
    grid_index: int
    content: bytes
    grid_type: str
    mode_key: str
    beat_numbers: tuple[int, ...]
    extension: str


@dataclass(frozen=True)
class UploadedGridImage:
    grid_index: int
    grid_type: str
    mode_key: str
    beat_numbers: tuple[int, ...]
    grid_path: str
    grid_url: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "grid_index": self.grid_index,
            "grid_type": self.grid_type,
            "mode_key": self.mode_key,
            "beat_numbers": list(self.beat_numbers),
            "grid_path": self.grid_path,
            "grid_url": self.grid_url,
        }


@dataclass(frozen=True)
class GridPromptQuery:
    episode_num: int
    grid_index: int
    grid_type: str = "render"
    mode_key: str = ""
    beat_numbers: str | None = ""


@dataclass(frozen=True)
class LocateGridPromptQuery:
    episode_num: int
    grid_index: int
    grid_type: str
    mode_key: str | None
    beat_numbers: tuple[int, ...]


@dataclass(frozen=True)
class GridPrompt:
    grid_index: int
    grid_type: str
    mode_key: str
    beat_numbers: tuple[int, ...]
    prompt: str
    prompt_path: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "grid_index": self.grid_index,
            "grid_type": self.grid_type,
            "mode_key": self.mode_key,
            "beat_numbers": list(self.beat_numbers),
            "prompt": self.prompt,
            "prompt_path": self.prompt_path,
        }


@dataclass(frozen=True)
class CutGridCommand:
    episode_num: int
    grid_index: int
    grid_type: str
    mode_key: str | None
    rows: int
    cols: int
    beat_start: int
    beat_end: int
    beat_numbers: tuple[int, ...] | None = None


@dataclass(frozen=True)
class PersistGridCutCommand:
    episode_num: int
    grid_index: int
    grid_type: str
    lookup_mode_key: str | None
    mode_key: str
    rows: int
    cols: int
    beat_numbers: tuple[int, ...]


@dataclass(frozen=True)
class CutGridResult:
    grid_index: int
    added: int
    skipped: int

    def as_dict(self) -> dict[str, int]:
        return {
            "grid_index": self.grid_index,
            "added": self.added,
            "skipped": self.skipped,
        }


@dataclass(frozen=True)
class GridSketchPreviewCommand:
    episode_num: int
    grid_index: int
    rows: int
    cols: int
    beat_numbers: tuple[int, ...]


@dataclass(frozen=True)
class BuildGridSketchPreviewCommand:
    episode_num: int
    grid_index: int
    rows: int
    cols: int
    beat_numbers: tuple[int, ...]


@dataclass(frozen=True)
class GridSketchPreview:
    grid_index: int
    rows: int
    cols: int
    beat_numbers: tuple[int, ...]
    preview_path: str
    preview_url: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "grid_index": self.grid_index,
            "rows": self.rows,
            "cols": self.cols,
            "beat_numbers": list(self.beat_numbers),
            "preview_path": self.preview_path,
            "preview_url": self.preview_url,
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


class GridPoolSelectionRejected(ValueError):
    pass


class GridPoolImageStale(GridPoolSelectionRejected):
    def __init__(self) -> None:
        super().__init__(
            "该草图已过期，请先重新生成。如确认仍要使用，请传 force=true。"
        )


class GridPoolUploadRejected(ValueError):
    pass


class GridPoolPromptRejected(ValueError):
    pass


class GridPoolCutRejected(ValueError):
    pass


class GridPoolPreviewRejected(ValueError):
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

    def upload_grid(
        self,
        context: ProjectContext,
        command: UploadGridImageCommand,
    ) -> UploadedGridImage:
        grid_type = command.grid_type.strip() or "render"
        if grid_type not in {"render", "sketch"}:
            raise GridPoolUploadRejected("grid_type must be render or sketch")
        try:
            beat_numbers = parse_grid_beat_numbers(command.beat_numbers)
        except Exception as exc:
            raise GridPoolUploadRejected(f"invalid beat_numbers: {exc}") from exc
        if not command.content:
            raise GridPoolUploadRejected("uploaded file is empty")
        return self._gateway.upload_grid(
            context,
            PersistGridImageCommand(
                episode_num=command.episode_num,
                grid_index=command.grid_index,
                content=command.content,
                grid_type=grid_type,
                mode_key=command.mode_key.strip() or "upload",
                beat_numbers=beat_numbers,
                extension=_grid_upload_extension(command.filename),
            ),
        )

    def prompt(
        self,
        context: ProjectContext,
        query: GridPromptQuery,
    ) -> GridPrompt:
        grid_type = query.grid_type.strip() or "render"
        if grid_type not in {"render", "sketch"}:
            raise GridPoolPromptRejected("grid_type must be render or sketch")
        try:
            beat_numbers = parse_grid_beat_numbers(query.beat_numbers)
        except Exception as exc:
            raise GridPoolPromptRejected(f"invalid beat_numbers: {exc}") from exc
        return self._gateway.prompt(
            context,
            LocateGridPromptQuery(
                episode_num=query.episode_num,
                grid_index=query.grid_index,
                grid_type=grid_type,
                mode_key=query.mode_key.strip() or None,
                beat_numbers=beat_numbers,
            ),
        )

    def cut(
        self,
        context: ProjectContext,
        command: CutGridCommand,
    ) -> CutGridResult:
        beat_numbers = (
            tuple(int(beat) for beat in command.beat_numbers)
            if command.beat_numbers
            else tuple(range(command.beat_start, command.beat_end + 1))
        )
        return self._gateway.cut(
            context,
            PersistGridCutCommand(
                episode_num=command.episode_num,
                grid_index=command.grid_index,
                grid_type=command.grid_type,
                lookup_mode_key=command.mode_key,
                mode_key=command.mode_key or f"{command.rows}x{command.cols}",
                rows=command.rows,
                cols=command.cols,
                beat_numbers=beat_numbers,
            ),
        )

    def preview(
        self,
        context: ProjectContext,
        command: GridSketchPreviewCommand,
    ) -> GridSketchPreview:
        beat_numbers = tuple(
            int(beat) for beat in command.beat_numbers if int(beat) > 0
        )
        if not beat_numbers:
            raise GridPoolPreviewRejected("beat_numbers is required")
        return self._gateway.preview(
            context,
            BuildGridSketchPreviewCommand(
                episode_num=command.episode_num,
                grid_index=command.grid_index,
                rows=command.rows,
                cols=command.cols,
                beat_numbers=beat_numbers,
            ),
        )
