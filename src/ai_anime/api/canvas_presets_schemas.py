"""Inbound schemas for Creative Canvas preset endpoints."""

from typing import Literal, Optional

from pydantic import BaseModel


class PresetCanvasRequest(BaseModel):
    """Stateless factory input for a project-scoped preset canvas."""

    scope: Literal["episode", "beat", "asset", "blank"] = "beat"
    episode: Optional[int] = None
    beat: Optional[int] = None
    primary_slot: str = "render"
    asset_kind: Optional[str] = None
    character: Optional[str] = None
    identity_id: Optional[str] = None
    asset_id: Optional[str] = None
    canvas_id: Optional[str] = None
    overwrite_existing: bool = False
    base_revision: Optional[int] = None


__all__ = ["PresetCanvasRequest"]
