"""Runtime settings for the two supported model access modes."""

from __future__ import annotations

import os
import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ai_anime.modules.model_usage.domain.official_defaults import (
    DEFAULT_COGNEE_EMBEDDING_DIM,
    DEFAULT_EMBEDDING_BATCH_SIZE,
)
from ai_anime.modules.model_usage.infrastructure.model_access_policy import (
    is_byok_allowed,
    runtime_model_access,
)
from ai_anime.shared.infrastructure.sqlite_pragmas import configure_sqlite_connection
from ai_anime.shared.runtime_paths import STATE_DIR

MODE_CLOUD = "cloud"
MODE_BYOK = "byok"


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


def mask_secret(value: str) -> str:
    clean = str(value or "").strip()
    if not clean:
        return ""
    if len(clean) <= 10:
        return "*" * len(clean)
    return f"{clean[:4]}...{clean[-4:]}"


def normalize_relay_base_url(value: str | None) -> str:
    base = str(value or "").strip().rstrip("/")
    if not base:
        return ""
    return base if base.endswith("/v1") else f"{base}/v1"


def get_effective_newapi_config() -> EffectiveNewApiConfig:
    access = runtime_model_access()
    return EffectiveNewApiConfig(
        mode=access.mode,
        source="byok" if access.mode == MODE_BYOK else "cloud_proxy",
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
        and (effective.mode == MODE_BYOK or effective.api_key)
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
            "configured": bool(
                effective.mode == MODE_BYOK
                and effective.base_url
            ),
            "baseUrl": effective.base_url if effective.mode == MODE_BYOK else "",
            "apiKeyPreview": (
                mask_secret(effective.api_key) if effective.mode == MODE_BYOK else ""
            ),
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


def _legacy_settings_db_path() -> Path:
    return Path(STATE_DIR) / "local" / "settings.db"


def purge_legacy_local_gateway_secrets() -> None:
    """Remove credentials left by the retired user-managed gateway settings."""

    path = _legacy_settings_db_path()
    if not path.is_file():
        return
    connection = sqlite3.connect(str(path), timeout=10, check_same_thread=False)
    try:
        configure_sqlite_connection(connection)
        table = connection.execute(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
            ("runtime_settings",),
        ).fetchone()
        if table is None:
            return
        connection.execute(
            """
            DELETE FROM runtime_settings
            WHERE key = 'model_gateway_mode'
               OR key LIKE 'official_newapi_%'
               OR key LIKE 'custom_newapi_%'
               OR key = 'media_relay_provider'
               OR key = 'media_relay_ttl_seconds'
               OR key LIKE 'oss_relay_%'
               OR key LIKE 'cloudinary_relay_%'
               OR key = 'model_access_v2_migrated'
            """
        )
        connection.commit()
    finally:
        connection.close()
