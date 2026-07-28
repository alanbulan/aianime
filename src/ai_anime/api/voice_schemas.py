"""Shared inbound schemas for narrator and character voice endpoints."""

from pydantic import BaseModel


class CharacterVoiceRecordRequest(BaseModel):
    data_url: str


class NarratorVoiceCopyRequest(BaseModel):
    source_path: str


class NarratorVoiceTrimRequest(BaseModel):
    start_seconds: float = 0.0
    duration_seconds: float = 4.0


class CharacterVoiceTrimRequest(BaseModel):
    source_path: str
    start_seconds: float = 0.0
    duration_seconds: float = 4.0


__all__ = [
    "CharacterVoiceRecordRequest",
    "CharacterVoiceTrimRequest",
    "NarratorVoiceCopyRequest",
    "NarratorVoiceTrimRequest",
]
