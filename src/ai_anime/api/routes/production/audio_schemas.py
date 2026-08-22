"""Inbound schemas for Production audio endpoints."""

from typing import Optional

from pydantic import BaseModel, ConfigDict


class EpisodeAudioGenerateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mode: Optional[str] = None
    beat_numbers: Optional[list[int]] = None


class EpisodeAudioRegenerateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")


__all__ = ["EpisodeAudioGenerateRequest", "EpisodeAudioRegenerateRequest"]
