"""Inbound schemas for Production audio endpoints."""

from typing import Optional

from pydantic import BaseModel, Field


class TTSGenerateRequest(BaseModel):
    provider: Optional[str] = None
    voice: Optional[str] = None
    model: Optional[str] = None
    rate: Optional[str] = None
    mode: Optional[str] = None
    beat_numbers: Optional[list[int]] = None


class TTSPreviewRequest(BaseModel):
    text: str
    provider: Optional[str] = None
    voice: Optional[str] = None
    model: Optional[str] = None


class EpisodeAudioGenerateRequest(BaseModel):
    model: str = Field(min_length=1)
    mode: Optional[str] = None
    beat_numbers: Optional[list[int]] = None


class EpisodeAudioModelRequest(BaseModel):
    model: str = Field(min_length=1)


__all__ = [
    "EpisodeAudioGenerateRequest",
    "EpisodeAudioModelRequest",
    "TTSGenerateRequest",
    "TTSPreviewRequest",
]
