"""Inbound schemas for screenplay and beat editing endpoints."""

from typing import Literal, Optional

from pydantic import BaseModel, Field

from ai_anime.modules.narrative_planning.public import SceneRef


class ScriptGenerateRequest(BaseModel):
    target_duration_total: int = Field(default=120, ge=30, le=600)
    rhythm: Literal["duration", "literal"] = "duration"


class BeatUpdate(BaseModel):
    narration_segment: Optional[str] = None
    visual_description: Optional[str] = None
    scene_ref: Optional[SceneRef] = None
    time_of_day: Optional[str] = None
    video_prompt: Optional[str] = None
    keyframe_prompt: Optional[str] = None
    video_mode: Optional[str] = None  # "first_frame" | "keyframe"
    video_config_json: Optional[str] = None
    audio_type: Optional[str] = None  # "silence" | "narration" | "dialogue"
    speaker: Optional[str] = None  # 说话人身份ID（dialogue 时必填）
    detected_identities: Optional[list[str]] = None
    detected_props: Optional[list[str]] = None


class VideoPromptGenerateRequest(BaseModel):
    manual_prompt_reference: Optional[str] = None
    prompt_guidance: Optional[str] = None


class BeatVideoPromptGenerateRequest(BaseModel):
    language: str = "zh"


class ScriptSaveRequest(BaseModel):
    beats: list[dict]


__all__ = [
    "BeatUpdate",
    "BeatVideoPromptGenerateRequest",
    "ScriptGenerateRequest",
    "ScriptSaveRequest",
    "VideoPromptGenerateRequest",
]
