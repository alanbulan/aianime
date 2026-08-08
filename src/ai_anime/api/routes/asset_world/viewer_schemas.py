"""Inbound schemas for Asset & World beat viewer endpoints."""

from pydantic import BaseModel


class BeatBackgroundAnchorUpdate(BaseModel):
    anchor_id: str


__all__ = ["BeatBackgroundAnchorUpdate"]
