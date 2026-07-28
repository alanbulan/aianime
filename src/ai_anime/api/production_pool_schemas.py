"""Inbound schemas for production media pool endpoints."""

from typing import Literal

from pydantic import BaseModel, Field


class PoolSelectRequest(BaseModel):
    pool_id: str
    force: bool = False


class VideoPoolSelectRequest(BaseModel):
    pool_id: str


class GridCutRequest(BaseModel):
    grid_type: Literal["render", "sketch"] = "sketch"
    mode_key: str | None = None
    rows: int
    cols: int
    beat_start: int
    beat_end: int
    beat_numbers: list[int] | None = None


class GridSketchPreviewRequest(BaseModel):
    rows: int = Field(..., ge=1)
    cols: int = Field(..., ge=1)
    beat_numbers: list[int] = Field(..., min_length=1)


__all__ = [
    "GridCutRequest",
    "GridSketchPreviewRequest",
    "PoolSelectRequest",
    "VideoPoolSelectRequest",
]
