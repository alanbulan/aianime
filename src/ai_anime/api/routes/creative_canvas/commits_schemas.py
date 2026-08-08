"""Inbound schemas for Creative Canvas canonical-slot commit endpoints."""

from pydantic import BaseModel, Field

from ai_anime.modules.creative_canvas.public import SlotTarget


class PushRequest(BaseModel):
    source_url: str
    target: SlotTarget = Field(discriminator="kind")
    mark_stale: bool = False


class ImpactRequest(BaseModel):
    target: SlotTarget = Field(discriminator="kind")


__all__ = ["ImpactRequest", "PushRequest"]
