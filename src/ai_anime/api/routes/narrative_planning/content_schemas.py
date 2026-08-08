"""Inbound schemas for episode content endpoints."""

from typing import Optional

from pydantic import BaseModel


class ContentUpdateRequest(BaseModel):
    content: str


class RewriteGenerateRequest(BaseModel):
    target_beats: int = 18
    beat_chars_min: int = 14
    beat_chars_max: int = 20
    narration_style: Optional[str] = None


__all__ = ["ContentUpdateRequest", "RewriteGenerateRequest"]
