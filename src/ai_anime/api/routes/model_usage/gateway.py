"""Read-only model access status and Electron capability updates."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from ai_anime.modules.model_usage.public import (
    configure_model_access,
    require_model_admin_token,
)
from ai_anime.modules.model_usage.public import build_model_gateway_status

router = APIRouter(prefix="/model-gateway")


class CommercialModelAssignmentBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    model_id: str = Field(alias="modelId", min_length=1, max_length=256)
    role: str = Field(min_length=1, max_length=64)
    priority: int = Field(default=100, ge=1, le=9999)
    enabled: bool = True
    context_window: int | None = Field(
        default=None,
        alias="contextWindow",
        gt=0,
    )
    max_output_tokens: int | None = Field(
        default=None,
        alias="maxOutputTokens",
        gt=0,
    )
    reasoning_efforts: list[str] = Field(
        default_factory=list,
        alias="reasoningEfforts",
        max_length=16,
    )
    default_reasoning_effort: str | None = Field(
        default=None,
        alias="defaultReasoningEffort",
        max_length=64,
    )


class CommercialModelCapabilityBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    model_id: str = Field(alias="modelId", min_length=1, max_length=256)
    extra_parameter_names: list[str] = Field(
        default_factory=list,
        alias="extraParameterNames",
        max_length=64,
    )
    image_prompt_profile: str | None = Field(
        default=None,
        alias="imagePromptProfile",
        max_length=64,
    )
    video_workflow: str | None = Field(
        default=None,
        alias="videoWorkflow",
        pattern="^(standard|advanced-reference|reference)$",
    )
    video_ratio_options: list[str] = Field(
        default_factory=list,
        alias="videoRatioOptions",
        max_length=32,
    )
    video_resolution_options: list[str] = Field(
        default_factory=list,
        alias="videoResolutionOptions",
        max_length=32,
    )
    video_size_options: list[str] = Field(
        default_factory=list,
        alias="videoSizeOptions",
        max_length=32,
    )
    video_resolution_max_seconds: dict[str, float] = Field(
        default_factory=dict,
        alias="videoResolutionMaxSeconds",
        max_length=32,
    )
    video_supports_generate_audio: bool | None = Field(
        default=None,
        alias="videoSupportsGenerateAudio",
    )
    video_supports_human_review: bool | None = Field(
        default=None,
        alias="videoSupportsHumanReview",
    )
    video_dialogue_only: bool | None = Field(
        default=None,
        alias="videoDialogueOnly",
    )
    video_extra_parameter_names: list[str] = Field(
        default_factory=list,
        alias="videoExtraParameterNames",
        max_length=32,
    )
    video_scene_optimize_options: list[str] = Field(
        default_factory=list,
        alias="videoSceneOptimizeOptions",
        max_length=32,
    )
    video_generation_min_seconds: float | None = Field(
        default=None,
        alias="videoGenerationMinSeconds",
        gt=0,
    )
    video_generation_max_seconds: float | None = Field(
        default=None,
        alias="videoGenerationMaxSeconds",
        gt=0,
    )
    video_duration_options: list[float] = Field(
        default_factory=list,
        alias="videoDurationOptions",
        max_length=32,
    )
    max_reference_images: int | None = Field(
        default=None,
        alias="maxReferenceImages",
        ge=0,
    )
    max_reference_videos: int | None = Field(
        default=None,
        alias="maxReferenceVideos",
        ge=0,
    )
    max_reference_audios: int | None = Field(
        default=None,
        alias="maxReferenceAudios",
        ge=0,
    )
    max_reference_total: int | None = Field(
        default=None,
        alias="maxReferenceTotal",
        ge=0,
    )
    reference_audio_min_seconds: float | None = Field(
        default=None,
        alias="referenceAudioMinSeconds",
        gt=0,
    )
    reference_audio_max_seconds: float | None = Field(
        default=None,
        alias="referenceAudioMaxSeconds",
        gt=0,
    )
    reference_audio_total_min_seconds: float | None = Field(
        default=None,
        alias="referenceAudioTotalMinSeconds",
        gt=0,
    )
    reference_audio_total_max_seconds: float | None = Field(
        default=None,
        alias="referenceAudioTotalMaxSeconds",
        gt=0,
    )
    reference_video_min_seconds: float | None = Field(
        default=None,
        alias="referenceVideoMinSeconds",
        gt=0,
    )
    reference_video_max_seconds: float | None = Field(
        default=None,
        alias="referenceVideoMaxSeconds",
        gt=0,
    )
    reference_video_total_min_seconds: float | None = Field(
        default=None,
        alias="referenceVideoTotalMinSeconds",
        gt=0,
    )
    reference_video_total_max_seconds: float | None = Field(
        default=None,
        alias="referenceVideoTotalMaxSeconds",
        gt=0,
    )

class CommercialModelAccessBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    allows_custom_models: bool = Field(alias="allowsCustomModels")
    mode: str = "mixed"
    model_assignments: list[CommercialModelAssignmentBody] = Field(
        default_factory=list,
        alias="modelAssignments",
        max_length=4096,
    )
    model_capabilities: list[CommercialModelCapabilityBody] = Field(
        default_factory=list,
        alias="modelCapabilities",
        max_length=64,
    )


@router.post("/internal/capability", include_in_schema=False)
async def set_commercial_model_access(
    body: CommercialModelAccessBody,
    model_admin_token: str | None = Header(
        default=None,
        alias="X-AI-Anime-Model-Admin-Token",
    ),
) -> dict[str, bool]:
    try:
        require_model_admin_token(model_admin_token)
        configure_model_access(
            allows_custom_models=body.allows_custom_models,
            mode=body.mode,
            model_assignments=[
                {
                    "modelId": item.model_id,
                    "role": item.role,
                    "priority": item.priority,
                    "enabled": item.enabled,
                    **(
                        {"contextWindow": item.context_window}
                        if item.context_window is not None
                        else {}
                    ),
                    **(
                        {"maxOutputTokens": item.max_output_tokens}
                        if item.max_output_tokens is not None
                        else {}
                    ),
                    **(
                        {"reasoningEfforts": item.reasoning_efforts}
                        if item.reasoning_efforts
                        else {}
                    ),
                    **(
                        {"defaultReasoningEffort": item.default_reasoning_effort}
                        if item.default_reasoning_effort
                        else {}
                    ),
                }
                for item in body.model_assignments
            ],
            model_capabilities=[
                item.model_dump(by_alias=True, exclude_none=True)
                for item in body.model_capabilities
            ],
        )
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"ok": True, "allowsCustomModels": body.allows_custom_models}


@router.get("/config")
async def get_model_gateway_config() -> dict[str, Any]:
    return {
        "ok": True,
        "data": build_model_gateway_status(),
    }
