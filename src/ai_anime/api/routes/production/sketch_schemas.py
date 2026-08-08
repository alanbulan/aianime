"""Inbound schemas for Production sketch endpoints."""

from typing import Literal, Optional

from pydantic import BaseModel


class SketchGenerateRequest(BaseModel):
    style: Optional[str] = None
    grid_index: int = 0
    sketch_scene_grouping: bool = True
    aspect_ratio: Literal["2:3", "16:9"] = "2:3"
    image_generation_selection: Optional[str] = None


__all__ = ["SketchGenerateRequest"]
