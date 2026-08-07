"""Read-only model access status and Electron capability updates."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from ai_anime.model_access_policy import (
    configure_model_access,
    require_model_admin_token,
)
from ai_anime.model_gateway_settings import (
    build_model_gateway_status,
    purge_legacy_local_gateway_secrets,
)

router = APIRouter(prefix="/model-gateway")


class CommercialModelAssignmentBody(BaseModel):
    model_id: str = Field(alias="modelId", min_length=1, max_length=256)
    role: str = Field(min_length=1, max_length=64)


class CommercialModelCapabilityBody(BaseModel):
    model_id: str = Field(alias="modelId", min_length=1, max_length=256)
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
    allows_custom_models: bool = Field(alias="allowsCustomModels")
    mode: str = "cloud"
    byok_base_url: str = Field(default="", alias="byokBaseUrl")
    byok_api_key: str = Field(default="", alias="byokApiKey")
    model_assignments: list[CommercialModelAssignmentBody] = Field(
        default_factory=list,
        alias="modelAssignments",
        max_length=128,
    )
    cloud_model_assignments: list[CommercialModelAssignmentBody] = Field(
        default_factory=list,
        alias="cloudModelAssignments",
        max_length=128,
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
            byok_base_url=body.byok_base_url,
            byok_api_key=body.byok_api_key,
            model_assignments=[
                {"modelId": item.model_id, "role": item.role}
                for item in body.model_assignments
            ],
            cloud_model_assignments=[
                {"modelId": item.model_id, "role": item.role}
                for item in body.cloud_model_assignments
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
    purge_legacy_local_gateway_secrets()
    return {
        "ok": True,
        "data": build_model_gateway_status(),
    }
