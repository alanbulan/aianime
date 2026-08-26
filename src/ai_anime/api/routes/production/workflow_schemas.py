"""Inbound schema for the canonical end-to-end production workflow."""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field


EpisodeNumber = Annotated[int, Field(gt=0)]


class ProductionWorkflowRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    episodes: list[EpisodeNumber] = Field(default_factory=list)
    filename: str = ""
    rebuild: bool = False
    spine_template: Literal["drama", "narrated"] | None = None
    visual_style: str | None = None
    narration_style: Literal["first_person", "third_person"] | None = None
    ethnicity: Literal["Chinese", "Japanese", "Korean", "Western"] | None = None
    target_episodes: int = Field(default=10, ge=1, le=200)
    planning_mode: Literal["chapters", "ai_events", "ai"] = "chapters"
    script_mode: Literal["duration", "literal"] = "duration"
    target_duration_total: int = Field(default=120, ge=30, le=600)
    target_beats: int | None = Field(default=None, ge=5, le=80)
    max_parallel: int = Field(default=4, ge=1, le=6)
    node_timeout_seconds: int = Field(default=7200, ge=30, le=28800)
    video_model: str | None = None
    video_resolution: str | None = None
    add_subtitles: bool = True
    add_bgm: bool = False


__all__ = ["ProductionWorkflowRequest"]
