"""Inbound schemas for style endpoints."""

from typing import Optional

from pydantic import BaseModel


class StylePreviewRequest(BaseModel):
    project: Optional[str] = None
    prompt: str = "A beautiful woman standing in a garden"
    model: str = "nanobanana"


__all__ = ["StylePreviewRequest"]
