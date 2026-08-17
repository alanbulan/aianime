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


class NarratorVoiceCopyRequest(BaseModel):
    source_path: str


class NarratorVoiceTrimRequest(BaseModel):
    start_seconds: float = 0.0
    duration_seconds: float = 4.0


__all__ = [
    "NarratorVoiceCopyRequest",
    "NarratorVoiceRecordRequest",
    "NarratorVoiceTrimRequest",
    "ProjectCreate",
    "ProjectCoverSelectRequest",
    "ProjectStatusFilter",
    "ProjectUpdate",
]
