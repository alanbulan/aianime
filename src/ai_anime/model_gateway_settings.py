"""Runtime settings for the two supported model access modes."""

from __future__ import annotations

import os
import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ai_anime.model_access_policy import is_byok_allowed, runtime_model_access
from ai_anime.official_defaults import (
    DEFAULT_COGNEE_EMBEDDING_DIM,
    DEFAULT_EMBEDDING_BATCH_SIZE,
)
from ai_anime.sqlite_pragmas import configure_sqlite_connection

MODE_CLOUD = "cloud"
MODE_BYOK = "byok"


@dataclass(frozen=True)
class EffectiveNewApiConfig:
    mode: str
    source: str
    base_url: str
    api_key: str


@dataclass(frozen=True)
class EffectiveMediaRelayConfig:
    source: str
    provider: str
    ttl_seconds: int
    endpoint: str
    bucket: str
    access_key_id: str
    access_key_secret: str
    cloud_name: str = ""
    cloudinary_api_key: str = ""
    cloudinary_api_secret: str = ""
    cloudinary_folder: str = ""


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
    effective = get_effective_newapi_config()
    cloud_base_url = normalize_relay_base_url(
        os.environ.get("AI_ANIME_CLOUD_PROXY_BASE_URL", "")
    )
    cloud_token = os.environ.get("AI_ANIME_CLOUD_PROXY_TOKEN", "").strip()
    effective_configured = bool(
        effective.base_url
        and (effective.mode == MODE_BYOK or effective.api_key)
    )
    return {
        "mode": effective.mode,
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


def get_effective_media_relay_config(
    *,
    env_provider: str | None = None,
    env_ttl_seconds: int | str | None = None,
    env_endpoint: str | None = None,
    env_bucket: str | None = None,
    env_access_key_id: str | None = None,
    env_access_key_secret: str | None = None,
    env_cloud_name: str | None = None,
    env_cloudinary_api_key: str | None = None,
    env_cloudinary_api_secret: str | None = None,
    env_cloudinary_folder: str | None = None,
) -> EffectiveMediaRelayConfig:
    return EffectiveMediaRelayConfig(
        source="platform",
        provider=str(
            env_provider or os.environ.get("MEDIA_RELAY_PROVIDER", "aliyun_oss")
        )
        .strip()
        .lower(),
        ttl_seconds=_integer(
            str(
                env_ttl_seconds
                if env_ttl_seconds is not None
                else os.environ.get("MEDIA_RELAY_TTL_SECONDS", "1800")
            ),
            1800,
        ),
        endpoint=str(env_endpoint or os.environ.get("OSS_RELAY_ENDPOINT", "")).strip(),
        bucket=str(env_bucket or os.environ.get("OSS_RELAY_BUCKET", "")).strip(),
        access_key_id=str(
            env_access_key_id or os.environ.get("OSS_RELAY_AK", "")
        ).strip(),
        access_key_secret=str(
            env_access_key_secret or os.environ.get("OSS_RELAY_SK", "")
        ).strip(),
        cloud_name=str(
            env_cloud_name or os.environ.get("CLOUDINARY_RELAY_CLOUD_NAME", "")
        ).strip(),
        cloudinary_api_key=str(
            env_cloudinary_api_key
            or os.environ.get("CLOUDINARY_RELAY_API_KEY", "")
        ).strip(),
        cloudinary_api_secret=str(
            env_cloudinary_api_secret
            or os.environ.get("CLOUDINARY_RELAY_API_SECRET", "")
        ).strip(),
        cloudinary_folder=str(
            env_cloudinary_folder
            or os.environ.get("CLOUDINARY_RELAY_FOLDER", "")
        )
        .strip()
        .strip("/"),
    )


def _legacy_settings_db_path() -> Path:
    from ai_anime import config

    return Path(config.STATE_DIR) / "local" / "settings.db"


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


def _integer(value: str | None, default: int) -> int:
    try:
        return int(str(value or "").strip())
    except ValueError:
        return default
