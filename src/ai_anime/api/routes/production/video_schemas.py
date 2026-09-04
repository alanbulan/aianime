"""Inbound schemas for production episode video endpoints."""

import re
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


class VideoReferenceAssetDeleteRequest(BaseModel):
    media_kind: Literal["images", "videos", "audios"]
    path: str


class VideoReferenceAssetCropRequest(BaseModel):
    asset_key: str
    source_path: str
    target: Literal["reference_image", "first_frame", "last_frame"] = "reference_image"
    x: float = 0
    y: float = 0
    width: float
    height: float


class VideoReferenceAssetAudioTrimRequest(BaseModel):
    asset_key: str
    source_path: str
    start_seconds: float = 0
    duration_seconds: float = 4


class GlobalOptimizeRequest(BaseModel):
    language: Literal["en", "zh"] = "en"


class VideoComposeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    add_subtitles: bool = True
    add_bgm: bool = False
    resolution: str = "720x1280"

    @field_validator("resolution")
    @classmethod
    def validate_resolution(cls, value: str) -> str:
        normalized = str(value).strip().lower().replace("×", "x")
        match = re.fullmatch(r"([1-9]\d*)x([1-9]\d*)", normalized)
        if not match:
            raise ValueError("resolution must use WIDTHxHEIGHT, for example 720x1280")
        width, height = (int(part) for part in match.groups())
        if width % 2 or height % 2:
            raise ValueError("resolution width and height must both be even")
        return f"{width}x{height}"


class SingleVideoRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    resolution: str = "720x1280"
    model: Optional[str] = None
    model_selector: Optional[str] = None
    video_routing_policy: Literal["project_selection", "role_priority"] = (
        "project_selection"
    )
    use_director_render: bool = False
    video_config_json: Optional[str] = None
    mode: Optional[
        Literal[
            "text_to_video",
            "first_frame",
            "first_last_frame",
            "multimodal_reference",
        ]
    ] = None
    duration: Optional[int] = Field(default=None, gt=0)
    ratio: Optional[str] = None
    generate_audio: Optional[bool] = None
    return_last_frame: Optional[bool] = None
    human_review: Optional[bool] = None
    scene_optimize: Optional[str] = None
    final_prompt: Optional[str] = None
    audio_setting: Optional[str] = None
    prompt_guidance: Optional[str] = None
    text_overlay: Optional[dict[str, Any]] = None


__all__ = [
    "GlobalOptimizeRequest",
    "VideoReferenceAssetAudioTrimRequest",
    "VideoReferenceAssetCropRequest",
    "VideoReferenceAssetDeleteRequest",
    "SingleVideoRequest",
    "VideoComposeRequest",
]
