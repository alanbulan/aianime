"""Inbound schemas for production render planning endpoints."""

from typing import Literal, Optional

from pydantic import BaseModel, Field


class GridRegenerateRequest(BaseModel):
    style: Optional[str] = None
    model: str = "nanobanana"
    scene_grouping: bool = False
    character_grouping: bool = False
    image_generation_selection: Optional[str] = None
    sketch_aspect_padding: Optional[bool] = None


class BeatsRegenerateRequest(BaseModel):
    beat_indices: list[int]
    style: Optional[str] = None
    model: str = "nanobanana"
    mode_key: str = "1x1_2-3"
    image_generation_selection: Optional[str] = None
    sketch_aspect_padding: Optional[bool] = None


class SketchRegenerateRequest(BaseModel):
    beat_indices: list[int]
    style: Optional[str] = None
    model: str = "nanobanana"
    mode_key: str = "1x1_2-3"
    image_generation_selection: Optional[str] = None


class RenderPlanRequest(BaseModel):
    beat_indices: list[int] = Field(..., min_length=1)
    strategy: Literal["location", "naive"] = "naive"
    force_one_by_one: bool = False
    aspect_mode: str = Field(..., description="e.g. '9:16', '1:1', '16:9'")
    image_generation_selection: Optional[str] = None
    sketch_aspect_padding: Optional[bool] = None


class PlanEntryOut(BaseModel):
    mode_key: str
    rows: int
    cols: int
    beat_numbers: list[int]
    location: str = ""
    padding_count: int = 0
    reasons: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class RenderPlanExecuteRequest(BaseModel):
    plan: list[PlanEntryOut]
    plan_hash: str
    input_fingerprint: str
    strategy: Literal["location", "naive"]
    aspect_mode: str
    force_one_by_one: bool = False
    custom_plan: bool = False
    beat_indices: list[int] = Field(..., min_length=1)
    image_generation_selection: Optional[str] = None
    sketch_aspect_padding: Optional[bool] = None


__all__ = [
    "BeatsRegenerateRequest",
    "GridRegenerateRequest",
    "PlanEntryOut",
    "RenderPlanExecuteRequest",
    "RenderPlanRequest",
    "SketchRegenerateRequest",
]
