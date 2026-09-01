"""Provider-neutral per-beat video generation configuration."""

from __future__ import annotations

import json
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field, field_validator


class VideoReferenceMode(str, Enum):
    TEXT_TO_VIDEO = "text_to_video"
    FIRST_FRAME = "first_frame"
    FIRST_LAST_FRAME = "first_last_frame"
    MULTIMODAL_REFERENCE = "multimodal_reference"


class BeatVideoConfig(BaseModel):
    """Per-beat video settings persisted in ``beats.video_config_json``."""

    mode: VideoReferenceMode = VideoReferenceMode.MULTIMODAL_REFERENCE
    final_prompt: str = ""
    prompt_guidance: str = ""
    prompt_source: str = ""
    prompt_validation_source: str = ""
    prompt_inputs_hash: str = ""
    prompt_updated_at: str = ""
    duration: int = 4
    resolution: str = "720p"
    ratio: str = "9:16"
    generate_audio: bool = True
    return_last_frame: bool = False
    human_review: bool = True
    scene_optimize: str = ""
    reference_image_paths: list[str] = Field(default_factory=list)
    reference_video_paths: list[str] = Field(default_factory=list)
    reference_audio_paths: list[str] = Field(default_factory=list)
    text_overlay: dict[str, Any] = Field(default_factory=dict)
    selected_asset_keys: list[str] = Field(default_factory=list)

    @field_validator(
        "final_prompt",
        "prompt_guidance",
        "prompt_source",
        "prompt_validation_source",
        "prompt_inputs_hash",
        "prompt_updated_at",
        "resolution",
        "ratio",
        "scene_optimize",
        mode="before",
    )
    @classmethod
    def _strip_text(cls, value: Any) -> str:
        return str(value or "").strip()

    @field_validator("duration", mode="before")
    @classmethod
    def _coerce_duration(cls, value: Any) -> int:
        try:
            duration = int(float(value or 4))
        except (TypeError, ValueError):
            duration = 4
        return max(1, duration)


def parse_video_config(value: Any) -> BeatVideoConfig:
    """Parse a stored dict/JSON config into a normalized config object."""

    if isinstance(value, BeatVideoConfig):
        return value
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return BeatVideoConfig()
        try:
            value = json.loads(text)
        except json.JSONDecodeError:
            return BeatVideoConfig()
    if isinstance(value, dict):
        return BeatVideoConfig.model_validate(value)
    return BeatVideoConfig()


def dump_video_config(config: BeatVideoConfig | dict[str, Any] | str | None) -> str:
    """Serialize config for SQLite storage."""

    return parse_video_config(config).model_dump_json()
