"""Runtime settings for the unified model router."""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any

from ai_anime.modules.model_usage.domain.official_defaults import (
    DEFAULT_COGNEE_EMBEDDING_DIM,
    DEFAULT_EMBEDDING_BATCH_SIZE,
)
from ai_anime.modules.model_usage.infrastructure.model_access_policy import (
    is_byok_allowed,
    runtime_model_access,
)
MODE_MIXED = "mixed"


@dataclass(frozen=True)
class EffectiveNewApiConfig:
    mode: str
    source: str
    base_url: str
    api_key: str


@dataclass(frozen=True)
class EffectiveCogneeEmbeddingConfig:
    source: str
    provider: str
    model: str
    dimensions: str
    upstream_provider: str
    upstream_model: str
    batch_size: str = ""


def normalize_relay_base_url(value: str | None) -> str:
    base = str(value or "").strip().rstrip("/")
    if not base:
        return ""
    return base if base.endswith("/v1") else f"{base}/v1"


def get_effective_newapi_config() -> EffectiveNewApiConfig:
    access = runtime_model_access()
    return EffectiveNewApiConfig(
        mode=access.mode,
        source="mixed_router",
        base_url=normalize_relay_base_url(access.base_url),
        api_key=str(access.api_key or "").strip(),
    )


def build_model_gateway_status() -> dict[str, Any]:
    access = runtime_model_access()
    effective = get_effective_newapi_config()
    cloud_base_url = normalize_relay_base_url(
        os.environ.get("AI_ANIME_CLOUD_PROXY_BASE_URL", "")
    )
    cloud_token = os.environ.get("AI_ANIME_CLOUD_PROXY_TOKEN", "").strip()
    effective_configured = bool(
        effective.base_url
        and effective.api_key
    )
    role_defaults: dict[str, str] = {}
    for assignment in access.model_assignments:
        role_defaults.setdefault(assignment.role, assignment.model_id)
    return {
        "mode": effective.mode,
        "roleDefaults": role_defaults,
        "effective": {
            "source": effective.source,
            "configured": effective_configured,
        },
        "cloud": {
            "configured": bool(cloud_base_url and cloud_token),
            "managed": True,
        },
        "byok": {
            "allowed": is_byok_allowed(),
            "configured": is_byok_allowed(),
        },
    }


def get_effective_cognee_embedding_config(
    *,
    model: str,
    dimensions: str | int | None = None,
) -> EffectiveCogneeEmbeddingConfig:
    clean_model = str(model or "").strip()
    if not clean_model:
        raise ValueError("embedding model is required")
    clean_dimensions = str(
        dimensions if dimensions is not None else DEFAULT_COGNEE_EMBEDDING_DIM
    ).strip()
    try:
        parsed_dimensions = int(clean_dimensions)
    except ValueError as exc:
        raise ValueError("embedding dimensions must be an integer") from exc
    if parsed_dimensions < 1 or parsed_dimensions > 65536:
        raise ValueError("embedding dimensions must be between 1 and 65536")
    batch_size = str(
        os.environ.get("EMBEDDING_BATCH_SIZE", DEFAULT_EMBEDDING_BATCH_SIZE)
    ).strip()
    return EffectiveCogneeEmbeddingConfig(
        source="model_access",
        provider="custom",
        model=clean_model,
        dimensions=str(parsed_dimensions),
        upstream_provider="",
        upstream_model="",
        batch_size=batch_size or DEFAULT_EMBEDDING_BATCH_SIZE,
    )
