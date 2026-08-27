"""Inbound schemas for character voice endpoints."""

from pydantic import BaseModel, Field, field_validator


class CharacterVoiceBindRequest(BaseModel):
    voice_id: str = Field(min_length=1, max_length=128)


class CharacterVoiceRecordRequest(BaseModel):
    data_url: str


class CharacterVoiceTrimRequest(BaseModel):
    source_path: str
    start_seconds: float = 0.0
    duration_seconds: float = 4.0


class CharacterVoiceDesignMissingRequest(BaseModel):
    character_names: list[str] = Field(default_factory=list, max_length=100)
    replace_existing: bool = False

    @field_validator("character_names")
    @classmethod
    def normalize_character_names(cls, value: list[str]) -> list[str]:
        return list(dict.fromkeys(name.strip() for name in value if name.strip()))


__all__ = [
    "CharacterVoiceBindRequest",
    "CharacterVoiceDesignMissingRequest",
    "CharacterVoiceRecordRequest",
    "CharacterVoiceTrimRequest",
]
