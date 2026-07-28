"""Inbound schemas for Creative Canvas projected-subgraph endpoints."""

from typing import Literal, Optional

from pydantic import BaseModel, Field


class ProjectionPresetCanvasRequest(BaseModel):
    """Project one preset subgraph into an existing user canvas."""

    scope: Literal["episode", "beat", "asset", "blank"] = "beat"
    projection_key: str = Field(min_length=1, max_length=160)
    episode: Optional[int] = None
    beat: Optional[int] = None
    primary_slot: str = "render"
    asset_kind: Optional[str] = None
    character: Optional[str] = None
    identity_id: Optional[str] = None
    asset_id: Optional[str] = None
    base_revision: int
    force_refresh: bool = False


class ProjectionStatusRequest(BaseModel):
    """Check whether projected preset subgraphs are stale."""

    projection_keys: Optional[list[str]] = None


class ProjectionRemoveRequest(BaseModel):
    """Remove one projected preset subgraph from an existing user canvas."""

    projection_key: str = Field(min_length=1, max_length=160)
    base_revision: int


__all__ = [
    "ProjectionPresetCanvasRequest",
    "ProjectionRemoveRequest",
    "ProjectionStatusRequest",
]
