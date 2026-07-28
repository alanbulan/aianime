"""Inbound schemas for Production audio endpoints."""

from typing import Optional

from pydantic import BaseModel


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


__all__ = ["TTSGenerateRequest", "TTSPreviewRequest"]
