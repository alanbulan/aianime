"""Inbound schemas for Production settings endpoints."""

from typing import Optional

from pydantic import BaseModel, Field


class RenderSettingsUpdate(BaseModel):
    render_image_selection: Optional[str] = None
    sketch_aspect_padding: Optional[bool] = None


class SketchSettingsUpdate(BaseModel):
    sketch_image_selection: Optional[str] = None


class SketchRegenQueueItem(BaseModel):
    id: str
    modeKey: str
    modeLabel: str
    beatNumbers: list[int] = Field(default_factory=list)
    sceneIds: list[str] = Field(default_factory=list)
    createdAt: str
    taskScope: Optional[str] = None


class SketchRegenQueueUpdate(BaseModel):
    items: list[SketchRegenQueueItem] = Field(default_factory=list)


class OperatorPasswordVerifyRequest(BaseModel):
    password: str = ""


__all__ = [
    "OperatorPasswordVerifyRequest",
    "RenderSettingsUpdate",
    "SketchRegenQueueItem",
    "SketchRegenQueueUpdate",
    "SketchSettingsUpdate",
]
