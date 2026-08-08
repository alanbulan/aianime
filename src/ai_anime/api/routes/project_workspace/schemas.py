"""Inbound schemas for project workspace endpoints."""

from typing import Literal, Optional

from pydantic import BaseModel

ProjectStatusFilter = Literal["all", "active", "archived", "deleted", "visible"]


class ProjectCreate(BaseModel):
    name: str


class ProjectUpdate(BaseModel):
    spine_template: Optional[Literal["drama", "narrated"]] = None
    aspect_ratio: Optional[Literal["2:3", "9:16", "16:9"]] = None
    visual_style: Optional[str] = None
    narration_style: Optional[str] = None
    ethnicity: Optional[str] = None
    rhythm: Optional[str] = None
    tts_provider: Optional[str] = None
    tts_model: Optional[str] = None
    tts_voice: Optional[str] = None
    grid_mode: Optional[str] = None
    grid_model: Optional[str] = None
    video_model: Optional[str] = None
    use_director_render: Optional[bool] = None
    video_resolution: Optional[str] = None
    add_subtitles: Optional[bool] = None
    sketch_image_selection: Optional[str] = None
    render_image_selection: Optional[str] = None
    sketch_aspect_padding: Optional[bool] = None


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
    "ProjectStatusFilter",
    "ProjectUpdate",
]
