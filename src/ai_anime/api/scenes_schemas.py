"""Inbound schemas for scene asset endpoints."""

from typing import Literal, Optional

from pydantic import BaseModel, Field


class PanoSphereCorrection(BaseModel):
    roll: float = 0.0
    pitch: float = 0.0
    yaw: float = 0.0


class PanoViewerCorrection(BaseModel):
    front_yaw_deg: float = 0.0
    sphere_correction_deg: PanoSphereCorrection = Field(
        default_factory=PanoSphereCorrection
    )


class SceneCreate(BaseModel):
    name: str
    aliases: list[str] = Field(default_factory=list)
    scene_type: str = "interior"
    base_scene_id: str = ""
    variant_id: str = ""
    time_of_day: str = ""
    environment_prompt: str = ""
    variant_prompt: str = ""
    description: str = ""
    spatial_layout_image: str = ""
    notes: str = ""


class SceneUpdate(BaseModel):
    name: Optional[str] = None
    aliases: Optional[list[str]] = None
    scene_type: Optional[str] = None
    base_scene_id: Optional[str] = None
    variant_id: Optional[str] = None
    time_of_day: Optional[str] = None
    environment_prompt: Optional[str] = None
    variant_prompt: Optional[str] = None
    description: Optional[str] = None
    spatial_layout_image: Optional[str] = None
    notes: Optional[str] = None


class ScenePanoGenerateRequest(BaseModel):
    source: Literal["master", "text"] = "master"
    style: Optional[str] = None
    model: Optional[str] = None
    image_size: Optional[str] = None
    quality: Optional[str] = None
    timeout_seconds: int = 1800


class SceneReferenceGenerateRequest(BaseModel):
    model: Optional[str] = None


__all__ = [
    "PanoSphereCorrection",
    "PanoViewerCorrection",
    "SceneCreate",
    "ScenePanoGenerateRequest",
    "SceneReferenceGenerateRequest",
    "SceneUpdate",
]
