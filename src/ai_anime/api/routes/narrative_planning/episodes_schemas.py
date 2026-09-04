"""Inbound schemas for episode endpoints."""

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict

from ai_anime.modules.narrative_planning.public import SceneRef


class EpisodePlanRequest(BaseModel):
    target_episodes: int = 10
    planning_mode: str = "chapters"


class InsertManualShotRequest(BaseModel):
    # None means insert before the first beat. Otherwise insert after this beat_number.
    after_beat_number: Optional[int] = None
    visual_description: str
    duration_seconds: Optional[float] = None
    scene_ref: Optional[SceneRef] = None
    time_of_day: Optional[str] = None
    detected_identities: Optional[list[str]] = None
    detected_props: Optional[list[str]] = None
    audio_type: Literal["silence", "narration", "dialogue"] = "silence"
    speaker: Optional[str] = None
    narration_segment: Optional[str] = None


class EpisodeUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: Optional[str] = None
    summary: Optional[str] = None
    character_names: Optional[list[str]] = None
    key_events: Optional[list[str]] = None
    cliffhanger: Optional[str] = None
    identity_ids: Optional[list[str]] = None
    beat_source_text: Optional[str] = None
    identity_default_map: Optional[dict[str, str]] = None


__all__ = ["EpisodePlanRequest", "EpisodeUpdate", "InsertManualShotRequest"]
