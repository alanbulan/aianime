from __future__ import annotations

import hashlib
import json
import sqlite3
import sys
import uuid

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from ai_anime.api.routes.model_usage import gateway as model_gateway
from ai_anime.modules.model_usage.infrastructure import model_gateway_settings
from ai_anime.modules.model_usage.infrastructure import model_runtime as config
from ai_anime.modules.model_usage.public import (
    configure_model_access,
    require_model_role,
    resolve_internal_model_for_role,
    resolve_model_for_role,
    runtime_model_access,
    runtime_model_capability,
)
from ai_anime.modules.model_usage.public import (
    MODE_BYOK,
    MODE_CLOUD,
    build_model_gateway_status,
    get_effective_cognee_embedding_config,
    get_effective_newapi_config,
)
from ai_anime.modules.task_execution.public import run_project_model_subprocess


@pytest.fixture(autouse=True)
def _reset_model_access() -> None:
    configure_model_access(allows_custom_models=False, mode=MODE_CLOUD)
    yield
    configure_model_access(allows_custom_models=False, mode=MODE_CLOUD)


def _isolate_runtime(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    monkeypatch.setattr(
        model_gateway_settings,
        "STATE_DIR",
        str(tmp_path / "state"),
    )
    monkeypatch.setenv("AI_ANIME_EDITION", "ce")
    monkeypatch.delenv("AI_ANIME_CONTROL_PLANE_DSN", raising=False)
    monkeypatch.setenv(
        "AI_ANIME_CLOUD_PROXY_BASE_URL",
        "http://127.0.0.1:45678/v1",
    )
    monkeypatch.setenv("AI_ANIME_CLOUD_PROXY_TOKEN", "desktop-proxy-token")
    monkeypatch.setenv("AI_ANIME_MODEL_ADMIN_TOKEN", "desktop-admin-token")


def test_standard_edition_always_uses_the_electron_cloud_proxy(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    _isolate_runtime(monkeypatch, tmp_path)
    monkeypatch.setenv("NEWAPI_BASE_URL", "https://legacy.example/v1")
    monkeypatch.setenv("NEWAPI_API_KEY", "legacy-secret")

    configure_model_access(
        allows_custom_models=False,
        mode=MODE_BYOK,
        byok_base_url="https://bypass.example/v1",
        byok_api_key="bypass-secret",
    )

    access = runtime_model_access()
    effective = get_effective_newapi_config()
    assert access.mode == MODE_CLOUD
    assert effective.mode == MODE_CLOUD
    assert effective.source == "cloud_proxy"
    assert effective.base_url == "http://127.0.0.1:45678/v1"
    assert effective.api_key == "desktop-proxy-token"


def test_professional_byok_uses_only_the_user_standard_endpoint(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    _isolate_runtime(monkeypatch, tmp_path)

    configure_model_access(
        allows_custom_models=True,
        mode=MODE_BYOK,
        byok_base_url="https://models.example.test/openai/v1/",
        byok_api_key="user-secret",
    )

    effective = get_effective_newapi_config()
    assert effective.mode == MODE_BYOK
    assert effective.source == "byok"
    assert effective.base_url == "https://models.example.test/openai/v1"
    assert effective.api_key == "user-secret"


def test_professional_byok_accepts_a_keyless_standard_endpoint(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    _isolate_runtime(monkeypatch, tmp_path)

    configure_model_access(
        allows_custom_models=True,
        mode=MODE_BYOK,
        byok_base_url="http://127.0.0.1:11434/v1",
        byok_api_key="",
    )

    effective = get_effective_newapi_config()
    status = build_model_gateway_status()
    assert effective.mode == MODE_BYOK
    assert effective.base_url == "http://127.0.0.1:11434/v1"
    assert effective.api_key == ""
    assert status["effective"]["configured"] is True
    assert status["byok"]["configured"] is True


def test_legacy_environment_credentials_cannot_override_selected_access(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    _isolate_runtime(monkeypatch, tmp_path)
    configure_model_access(
        allows_custom_models=True,
        mode=MODE_BYOK,
        byok_base_url="https://models.example.test/v1",
        byok_api_key="selected-secret",
    )

    monkeypatch.setenv("OPENAI_API_KEY", "legacy-secret")
    monkeypatch.setenv("OPENAI_BASE_URL", "https://legacy.example/v1")
    api_key, base_url = config.get_newapi_runtime_credentials()

    assert api_key == "selected-secret"
    assert base_url == "https://models.example.test/v1"


def test_internal_capability_endpoint_requires_the_electron_admin_token(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    _isolate_runtime(monkeypatch, tmp_path)
    app = FastAPI()
    app.include_router(model_gateway.router)
    client = TestClient(app)
    body = {
        "allowsCustomModels": True,
        "mode": MODE_BYOK,
        "byokBaseUrl": "https://models.example.test/v1",
        "byokApiKey": "user-secret",
        "modelCapabilities": [
            {
                "modelId": "cloud/video-standard",
                "referenceAudioMinSeconds": 1.8,
                "referenceAudioMaxSeconds": 15.2,
                "referenceAudioTotalMinSeconds": 2,
                "referenceAudioTotalMaxSeconds": 15.2,
                "referenceVideoMinSeconds": 3,
                "referenceVideoMaxSeconds": 10,
                "referenceVideoTotalMinSeconds": 5,
                "referenceVideoTotalMaxSeconds": 20,
            }
        ],
    }

    denied = client.post("/model-gateway/internal/capability", json=body)
    accepted = client.post(
        "/model-gateway/internal/capability",
        json=body,
        headers={"X-AI-Anime-Model-Admin-Token": "desktop-admin-token"},
    )

    assert denied.status_code == 403
    assert accepted.status_code == 200
    status_response = client.get("/model-gateway/config")
    assert status_response.status_code == 200
    payload = status_response.json()
    assert payload["data"]["mode"] == MODE_BYOK
    assert payload["data"]["byok"]["allowed"] is True
    assert payload["data"]["byok"]["apiKeyPreview"] == "user...cret"
    assert "user-secret" not in status_response.text
    capability = runtime_model_capability("cloud/video-standard")
    assert capability is not None
    assert capability.reference_audio_min_seconds == 1.8
    assert capability.reference_audio_total_max_seconds == 15.2
    assert capability.reference_video_min_seconds == 3
    assert capability.reference_video_total_max_seconds == 20


def test_model_gateway_status_never_exposes_cloud_proxy_credentials(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    _isolate_runtime(monkeypatch, tmp_path)

    status = build_model_gateway_status()

    assert status["mode"] == MODE_CLOUD
    assert status["cloud"] == {"configured": True, "managed": True}
    assert status["effective"] == {
        "source": "cloud_proxy",
        "configured": True,
    }
    assert "desktop-proxy-token" not in json.dumps(status)


def test_model_gateway_status_exposes_active_role_defaults_without_secrets(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    _isolate_runtime(monkeypatch, tmp_path)
    configure_model_access(
        allows_custom_models=False,
        mode=MODE_CLOUD,
        cloud_model_assignments=[
            {"modelId": "cloud-text", "role": "TEXT"},
            {"modelId": "cloud-embedding", "role": "EMBEDDING"},
        ],
    )

    status = build_model_gateway_status()

    assert status["roleDefaults"] == {
        "EMBEDDING": "cloud-embedding",
        "TEXT": "cloud-text",
    }


def test_embedding_configuration_uses_only_the_selected_model_access_transport(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    _isolate_runtime(monkeypatch, tmp_path)
    monkeypatch.setenv("COGNEE_EMBEDDING_PROVIDER", "gemini")
    monkeypatch.setenv("COGNEE_EMBEDDING_MODEL", "ignored-legacy-model")

    effective = get_effective_cognee_embedding_config(
        model="cloud-embedding-standard",
        dimensions=1024,
    )

    assert effective.source == "model_access"
    assert effective.provider == "custom"
    assert effective.model == "cloud-embedding-standard"


def test_byok_model_roles_are_enforced_from_the_encrypted_assignment_snapshot() -> None:
    configure_model_access(
        allows_custom_models=True,
        mode=MODE_BYOK,
        byok_base_url="https://models.example.test/v1",
        model_assignments=[
            {"modelId": "text-model", "role": "TEXT"},
            {"modelId": "embedding-model", "role": "EMBEDDING"},
        ],
    )

    require_model_role("text-model", "TEXT")
    require_model_role("embedding-model", "EMBEDDING")
    with pytest.raises(PermissionError, match="not assigned"):
        require_model_role("text-model", "EMBEDDING")


def test_cloud_task_model_keeps_the_gateway_catalog_code() -> None:
    assert resolve_model_for_role("cloud-text-task-sku", "TEXT") == (
        "cloud-text-task-sku"
    )


def test_cloud_internal_text_model_resolves_to_the_bootstrap_catalog_default() -> None:
    configure_model_access(
        allows_custom_models=False,
        mode=MODE_CLOUD,
        cloud_model_assignments=[
            {"modelId": "cloud-text-default", "role": "TEXT"},
        ],
    )

    assert resolve_model_for_role("cloud-text-default", "TEXT") == (
        "cloud-text-default"
    )
    assert resolve_internal_model_for_role("legacy-internal-default", "TEXT") == (
        "cloud-text-default"
    )
    assert resolve_model_for_role("cloud-text-alternate", "TEXT") == (
        "cloud-text-alternate"
    )
    assert resolve_model_for_role("explicit-image-model", "IMAGE_GENERATION") == (
        "explicit-image-model"
    )


def test_cloud_internal_text_model_requires_a_catalog_default() -> None:
    configure_model_access(
        allows_custom_models=False,
        mode=MODE_CLOUD,
        cloud_model_assignments=[],
    )

    with pytest.raises(
        PermissionError,
        match="Cloud has no default model assigned to role TEXT",
    ):
        resolve_internal_model_for_role("legacy-internal-default", "TEXT")


def test_cloud_text_model_factory_uses_the_bootstrap_catalog_default(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(
        "AI_ANIME_CLOUD_PROXY_BASE_URL",
        "http://127.0.0.1:45678/v1",
    )
    monkeypatch.setenv("AI_ANIME_CLOUD_PROXY_TOKEN", "desktop-proxy-token")
    configure_model_access(
        allows_custom_models=False,
        mode=MODE_CLOUD,
        cloud_model_assignments=[
            {"modelId": "cloud-text-default", "role": "TEXT"},
        ],
    )
    captured: dict[str, object] = {}

    def fake_model(model_name: str, **kwargs):
        captured.update({"model": model_name, **kwargs})
        return object()

    monkeypatch.setattr(config, "_newapi_text_openai_model", fake_model)

    config.get_newapi_text_pydantic_model(
        "STYLE_ANALYZER_MODEL",
        "legacy-style-analyzer-default",
    )

    assert captured["model"] == "cloud-text-default"

    config.get_newapi_text_pydantic_model(
        "STYLE_ANALYZER_MODEL",
        "legacy-style-analyzer-default",
        model_name_override="cloud-text-alternate",
    )

    assert captured["model"] == "cloud-text-alternate"

    config.get_pydantic_model("legacy-internal-override")

    assert captured["model"] == "cloud-text-default"


def test_synchronous_text_operation_owns_one_idempotency_key(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    _isolate_runtime(monkeypatch, tmp_path)
    client = config.get_model_access_openai_client()
    try:
        idempotency_key = client.default_headers["Idempotency-Key"]
    finally:
        client.close()

    assert str(uuid.UUID(idempotency_key)) == idempotency_key


def test_byok_task_model_uses_an_explicit_assignment_or_the_normalized_default() -> (
    None
):
    configure_model_access(
        allows_custom_models=True,
        mode=MODE_BYOK,
        byok_base_url="https://models.example.test/v1",
        model_assignments=[
            {"modelId": "z-text-model", "role": "TEXT"},
            {"modelId": "a-text-model", "role": "TEXT"},
            {"modelId": "embedding-model", "role": "EMBEDDING"},
        ],
    )

    assert resolve_model_for_role("z-text-model", "TEXT") == "z-text-model"
    assert resolve_model_for_role("cloud-text-task-sku", "TEXT") == "a-text-model"
    with pytest.raises(PermissionError, match="no model assigned"):
        resolve_model_for_role("cloud-rerank-task-sku", "RERANK")


def test_text_model_factory_never_sends_a_cloud_task_sku_to_byok(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    configure_model_access(
        allows_custom_models=True,
        mode=MODE_BYOK,
        byok_base_url="https://models.example.test/v1",
        byok_api_key="user-secret",
        model_assignments=[{"modelId": "user-text-model", "role": "TEXT"}],
    )
    captured: dict[str, object] = {}

    def fake_model(model_name: str, **kwargs):
        captured.update({"model": model_name, **kwargs})
        return object()

    monkeypatch.setattr(config, "_newapi_text_openai_model", fake_model)

    config.get_newapi_text_pydantic_model(
        "STYLE_ANALYZER_MODEL",
        "cloud-style-analyzer-sku",
    )

    assert captured["model"] == "user-text-model"
    assert captured["base_url"] == "https://models.example.test/v1"
    assert captured["api_key"] == "user-secret"


def test_model_gateway_status_purges_retired_local_gateway_secrets(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    _isolate_runtime(monkeypatch, tmp_path)
    database = tmp_path / "state" / "local" / "settings.db"
    database.parent.mkdir(parents=True)
    with sqlite3.connect(database) as connection:
        connection.execute(
            "CREATE TABLE runtime_settings ("
            "key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)"
        )
        connection.executemany(
            "INSERT INTO runtime_settings(key, value, updated_at) VALUES (?, ?, ?)",
            [
                ("model_gateway_mode", "custom", "now"),
                ("official_newapi_api_key", "official-secret", "now"),
                ("custom_newapi_api_key", "custom-secret", "now"),
                ("media_relay_provider", "aliyun_oss", "now"),
            ],
        )

    app = FastAPI()
    app.include_router(model_gateway.router)
    response = TestClient(app).get("/model-gateway/config")
    assert response.status_code == 200

    with sqlite3.connect(database) as connection:
        keys = {
            row[0]
            for row in connection.execute("SELECT key FROM runtime_settings").fetchall()
        }
    assert "model_gateway_mode" not in keys
    assert not any(key.startswith("official_newapi_") for key in keys)
    assert not any(key.startswith("custom_newapi_") for key in keys)
    assert not any("relay" in key for key in keys)
    assert "model_access_v2_migrated" not in keys


def test_model_gateway_has_no_user_managed_media_storage_endpoint(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    _isolate_runtime(monkeypatch, tmp_path)
    app = FastAPI()
    app.include_router(model_gateway.router)
    client = TestClient(app)

    response = client.post(
        "/model-gateway/media-relay/config",
        json={
            "provider": "aliyun_oss",
            "endpoint": "oss.example.test",
            "bucket": "user-bucket",
            "accessKeyId": "user-access-id",
            "accessKeySecret": "user-access-secret",
        },
    )
    status = client.get("/model-gateway/config")

    assert response.status_code == 404
    assert status.status_code == 200
    assert "mediaRelay" not in status.json()["data"]


@pytest.mark.parametrize(
    ("mode", "allows_custom_models", "base_url", "api_key"),
    [
        (MODE_CLOUD, False, "http://127.0.0.1:45678/v1", "cloud-proxy-secret"),
        (MODE_BYOK, True, "https://models.example.test/v1", "user-byok-secret"),
    ],
)
def test_model_subprocess_receives_only_the_selected_runtime_over_stdin(
    monkeypatch: pytest.MonkeyPatch,
    mode: str,
    allows_custom_models: bool,
    base_url: str,
    api_key: str,
) -> None:
    monkeypatch.setenv("AI_ANIME_CLOUD_PROXY_BASE_URL", base_url)
    monkeypatch.setenv("AI_ANIME_CLOUD_PROXY_TOKEN", api_key)
    monkeypatch.setenv("OPENAI_API_KEY", "legacy-openai-secret")
    monkeypatch.setenv("OPENROUTER_API_KEY", "legacy-openrouter-secret")
    monkeypatch.setenv("MODEL_API_KEY", "legacy-model-secret")
    configure_model_access(
        allows_custom_models=allows_custom_models,
        mode=mode,
        byok_base_url=base_url if mode == MODE_BYOK else "",
        byok_api_key=api_key if mode == MODE_BYOK else "",
        model_assignments=(
            [{"modelId": "byok-text", "role": "TEXT"}] if mode == MODE_BYOK else []
        ),
        cloud_model_assignments=(
            [{"modelId": "cloud-text", "role": "TEXT"}] if mode == MODE_CLOUD else []
        ),
        model_capabilities=[
            {
                "modelId": "cloud/video-standard",
                "referenceVideoMaxSeconds": 10,
            }
        ],
    )
    script = "\n".join(
        [
            "import hashlib, json, os",
            "from ai_anime.modules.model_usage.public import load_model_access_from_stdin, runtime_model_access, runtime_model_capability",
            "loaded = load_model_access_from_stdin()",
            "access = runtime_model_access()",
            "capability = runtime_model_capability('cloud/video-standard')",
            "legacy = ['AI_ANIME_CLOUD_PROXY_TOKEN', 'OPENAI_API_KEY', 'OPENROUTER_API_KEY', 'MODEL_API_KEY']",
            "print(json.dumps({'loaded': loaded, 'mode': access.mode, 'baseUrl': access.base_url, "
            "'apiKeyHash': hashlib.sha256(access.api_key.encode()).hexdigest(), "
            "'modelAssignments': [[item.model_id, item.role] for item in access.model_assignments], "
            "'referenceVideoMaxSeconds': capability.reference_video_max_seconds if capability else None, "
            "'legacyPresent': any(os.environ.get(name) for name in legacy), "
            "'stdinMarkerPresent': 'AI_ANIME_MODEL_ACCESS_STDIN' in os.environ}))",
        ]
    )

    completed = run_project_model_subprocess(
        [sys.executable, "-c", script],
        capture_output=True,
        text=True,
        check=True,
        timeout=10,
    )

    payload = json.loads(completed.stdout)
    assert payload == {
        "loaded": True,
        "mode": mode,
        "baseUrl": base_url,
        "apiKeyHash": hashlib.sha256(api_key.encode()).hexdigest(),
        "modelAssignments": (
            [["byok-text", "TEXT"]] if mode == MODE_BYOK else [["cloud-text", "TEXT"]]
        ),
        "referenceVideoMaxSeconds": 10.0,
        "legacyPresent": False,
        "stdinMarkerPresent": False,
    }
    assert api_key not in " ".join(completed.args)
