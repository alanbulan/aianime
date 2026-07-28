"""Inbound schemas for screenplay and beat editing endpoints."""

from typing import Optional

from pydantic import BaseModel

from ai_anime.modules.narrative_planning.public import SceneRef


class ScriptGenerateRequest(BaseModel):
    pass


class BeatUpdate(BaseModel):
    narration_segment: Optional[str] = None
    visual_description: Optional[str] = None
    scene_ref: Optional[SceneRef] = None
    time_of_day: Optional[str] = None
    video_prompt: Optional[str] = None
    keyframe_prompt: Optional[str] = None
    video_mode: Optional[str] = None  # "first_frame" | "keyframe"
    seedance2_config_json: Optional[str] = None
    audio_type: Optional[str] = None  # "silence" | "narration" | "dialogue"
    speaker: Optional[str] = None  # 说话人身份ID（dialogue 时必填）
    detected_identities: Optional[list[str]] = None
    detected_props: Optional[list[str]] = None


class Seedance2PromptGenerateRequest(BaseModel):
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
    "Seedance2PromptGenerateRequest",
]
