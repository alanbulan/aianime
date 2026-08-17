"""Inbound schemas for Production audio endpoints."""

from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class EpisodeAudioGenerateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    model: Optional[str] = Field(default=None, min_length=1)
    mode: Optional[str] = None
    beat_numbers: Optional[list[int]] = None


class EpisodeAudioModelRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    model: str = Field(min_length=1)


__all__ = [
    "EpisodeAudioGenerateRequest",
    "EpisodeAudioModelRequest",
]
