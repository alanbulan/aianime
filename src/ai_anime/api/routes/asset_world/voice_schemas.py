"""Inbound schemas for character voice endpoints."""

from pydantic import BaseModel


class CharacterVoiceRecordRequest(BaseModel):
    data_url: str


class CharacterVoiceTrimRequest(BaseModel):
    source_path: str
    start_seconds: float = 0.0
    duration_seconds: float = 4.0


__all__ = [
    "CharacterVoiceRecordRequest",
    "CharacterVoiceTrimRequest",
]
