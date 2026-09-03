"""Inbound schemas for project workspace endpoints."""

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

ProjectStatusFilter = Literal["all", "active", "archived", "deleted", "visible"]


class ProjectCreate(BaseModel):
    name: str


class ProjectUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: Optional[str] = Field(default=None, min_length=1, max_length=80)
    spine_template: Optional[Literal["drama", "narrated"]] = None
    aspect_ratio: Optional[Literal["2:3", "9:16", "16:9"]] = None
    visual_style: Optional[str] = None
    narration_style: Optional[str] = None
    ethnicity: Optional[str] = None
    rhythm: Optional[str] = None
    grid_mode: Optional[str] = None
    video_model: Optional[str] = None
    use_director_render: Optional[bool] = None
    video_resolution: Optional[str] = None
    add_subtitles: Optional[bool] = None
    add_bgm: Optional[bool] = None
    sketch_image_selection: Optional[str] = None
    render_image_selection: Optional[str] = None
    sketch_aspect_padding: Optional[bool] = None

    @field_validator("display_name")
    @classmethod
    def validate_display_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        if not normalized:
            raise ValueError("项目名称不能为空")
        return normalized


class ProjectCoverSelectRequest(BaseModel):
    source_path: str


class NarratorVoiceRecordRequest(BaseModel):
    data_url: str


class NarratorVoicePresetGenerateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(default="", max_length=80)
    model_selector: str = Field(min_length=1, max_length=768)
    voice: str = Field(default="", max_length=120)
    text: str = Field(min_length=1, max_length=500)

    @field_validator("name", "voice")
    @classmethod
    def normalize_optional_name(cls, value: str) -> str:
        return value.strip()

    @field_validator("model_selector", "text")
    @classmethod
    def normalize_required_text(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("内容不能为空")
        return normalized


class NarratorVoiceDesignRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(default="", max_length=80)
    model_selector: str = Field(min_length=1, max_length=768)
    voice_prompt: str = Field(min_length=1, max_length=2048)
    preview_text: str = Field(min_length=1, max_length=1024)
    preferred_name: str = Field(default="", max_length=16)
    language: str = Field(min_length=1, max_length=16)
    sample_rate: int = Field(gt=0, le=192000)
    response_format: Literal["wav", "mp3"]

    @field_validator("name", "preferred_name")
    @classmethod
    def normalize_optional_voice_design_text(cls, value: str) -> str:
        return value.strip()

    @field_validator("model_selector", "voice_prompt", "preview_text", "language")
    @classmethod
    def normalize_required_voice_design_text(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("内容不能为空")
        return normalized


class NarratorVoiceBindRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    voice_id: str = Field(min_length=1, max_length=128)

    @field_validator("voice_id")
    @classmethod
    def normalize_voice_id(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("voice_id is required")
        return normalized


class NarratorVoiceTrimRequest(BaseModel):
    start_seconds: float = 0.0
    duration_seconds: float = 4.0


__all__ = [
    "NarratorVoiceBindRequest",
    "NarratorVoiceDesignRequest",
    "NarratorVoicePresetGenerateRequest",
    "NarratorVoiceRecordRequest",
    "NarratorVoiceTrimRequest",
    "ProjectCreate",
    "ProjectCoverSelectRequest",
    "ProjectStatusFilter",
    "ProjectUpdate",
]
