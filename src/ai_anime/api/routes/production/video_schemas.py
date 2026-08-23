"""Inbound schemas for production episode video endpoints."""

from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict

class Seedance2AssetDeleteRequest(BaseModel):
    media_kind: Literal["images", "audios"]
    path: str


class Seedance2AssetCropRequest(BaseModel):
    asset_key: str
    source_path: str
    target: Literal["reference_image", "first_frame", "last_frame"] = "reference_image"
    x: float = 0
    y: float = 0
    width: float
    height: float


class Seedance2AssetAudioTrimRequest(BaseModel):
    asset_key: str
    source_path: str
    start_seconds: float = 0
    duration_seconds: float = 4


class GlobalOptimizeRequest(BaseModel):
    language: str = "en"  # "zh" 中文 / "en" SuperPower英文(Gemini)


class VideoComposeRequest(BaseModel):
    add_subtitles: bool = True
    add_bgm: bool = False
    resolution: str = "720x1280"


class SingleVideoRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    resolution: str = "720x1280"
    model: Optional[str] = None
    model_selector: Optional[str] = None
    use_director_render: bool = False
    seedance2_config_json: Optional[str] = None
    mode: Optional[str] = None
    duration: Optional[int] = None
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
    "Seedance2AssetAudioTrimRequest",
    "Seedance2AssetCropRequest",
    "Seedance2AssetDeleteRequest",
    "SingleVideoRequest",
    "VideoComposeRequest",
]
