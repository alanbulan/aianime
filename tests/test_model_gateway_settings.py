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
from ai_anime.migrations.model_usage import retired_gateway_settings
from ai_anime.modules.model_usage.infrastructure import model_runtime as config
from ai_anime.modules.model_usage.public import (
    MODE_MIXED,
    build_model_gateway_status,
    configure_model_access,
    get_effective_cognee_embedding_config,
    get_effective_model_gateway_config,
    resolve_model_assignment_for_role,
    resolve_model_for_role,
    runtime_model_access,
    runtime_model_capability,
)
from ai_anime.modules.task_execution.public import run_project_model_subprocess
from ai_anime.shared.infrastructure.project_task_context import project_task_run_context


@pytest.fixture(autouse=True)
def _reset_model_access() -> None:
    configure_model_access(allows_custom_models=False, mode=MODE_MIXED)
    yield
    configure_model_access(allows_custom_models=False, mode=MODE_MIXED)


def _isolate_runtime(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    monkeypatch.setenv("AI_ANIME_EDITION", "ce")
    monkeypatch.delenv("AI_ANIME_CONTROL_PLANE_DSN", raising=False)
    monkeypatch.setenv(
        "AI_ANIME_CLOUD_PROXY_BASE_URL",
        "http://127.0.0.1:45678/v1",
    )
    monkeypatch.setenv("AI_ANIME_CLOUD_PROXY_TOKEN", "desktop-proxy-token")
    monkeypatch.setenv("AI_ANIME_MODEL_ADMIN_TOKEN", "desktop-admin-token")


def _assignments() -> list[dict[str, object]]:
    return [
        {
            "modelId": "cloud-text",
            "role": "TEXT",
            "priority": 10,
            "enabled": True,
        },
        {
            "modelId": "byok-text",
            "role": "TEXT",
            "priority": 20,
            "enabled": True,
        },
        {
            "modelId": "cloud-embedding",
            "role": "EMBEDDING",
            "priority": 10,
            "enabled": True,
        },
    ]


def test_all_editions_use_only_the_electron_mixed_router(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    _isolate_runtime(monkeypatch, tmp_path)
    monkeypatch.setenv("MODEL_GATEWAY_BASE_URL", "https://legacy.example/v1")
    monkeypatch.setenv("MODEL_GATEWAY_API_KEY", "legacy-secret")
    monkeypatch.setenv("OPENAI_BASE_URL", "https://legacy-openai.example/v1")
    monkeypatch.setenv("OPENAI_API_KEY", "legacy-openai-secret")
    configure_model_access(
        allows_custom_models=False,
        mode=MODE_MIXED,
        model_assignments=_assignments(),
    )

    access = runtime_model_access()
    effective = get_effective_model_gateway_config()

    assert access.mode == MODE_MIXED
    assert effective.mode == MODE_MIXED
    assert effective.source == "mixed_router"
    assert effective.base_url == "http://127.0.0.1:45678/v1"
    assert effective.api_key == "desktop-proxy-token"
    assert "legacy" not in effective.base_url
    assert "legacy" not in effective.api_key


def test_internal_capability_endpoint_accepts_only_router_state(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    _isolate_runtime(monkeypatch, tmp_path)
    app = FastAPI()
    app.include_router(model_gateway.router)
    client = TestClient(app)
    body = {
        "allowsCustomModels": True,
        "mode": MODE_MIXED,
        "modelAssignments": _assignments(),
        "modelCapabilities": [
            {
                "modelId": "cloud/video-standard",
                "imageRatioOptions": ["1:1", "16:9"],
                "imageSizeOptions": ["1328x1328", "1664x928"],
                "videoWorkflow": "advanced-reference",
                "videoRatioOptions": ["16:9", "9:16"],
                "videoResolutionOptions": ["512p", "720p"],
                "videoSizeOptions": ["1344x768", "768x1344", "1024x1024"],
                "videoSupportsGenerateAudio": False,
                "videoSupportsHumanReview": True,
                "videoExtraParameterNames": ["steps", "seed", "turbo"],
                "videoSceneOptimizeOptions": ["cinematic", "realistic"],
                "videoDurationOptions": [3, 5, 8],
                "videoGenerationMinSeconds": 4,
                "videoGenerationMaxSeconds": 15,
                "maxReferenceImages": 5,
                "maxReferenceVideos": 1,
                "maxReferenceAudios": 0,
                "maxReferenceTotal": 6,
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
    payload = status_response.json()["data"]
    assert payload["mode"] == MODE_MIXED
    assert payload["effective"] == {
        "source": "mixed_router",
        "configured": True,
    }
    assert payload["byok"] == {"allowed": True, "configured": True}
    capability = runtime_model_capability("cloud/video-standard")
    assert capability is not None
    assert capability.image_ratio_options == ("1:1", "16:9")
    assert capability.image_size_options == ("1328x1328", "1664x928")
    assert capability.video_resolution_options == (
        "512p",
        "720p",
    )
    assert capability.video_ratio_options == ("16:9", "9:16")
    assert capability.video_size_options == (
        "1344x768",
        "768x1344",
        "1024x1024",
    )
    assert capability.video_supports_generate_audio is False
    assert capability.video_supports_human_review is True
    assert capability.video_extra_parameter_names == ("steps", "seed", "turbo")
    assert capability.video_scene_optimize_options == ("cinematic", "realistic")
    assert capability.video_duration_options == (3.0, 5.0, 8.0)
    assert payload["roleDefaults"] == {
        "TEXT": "cloud-text",
        "EMBEDDING": "cloud-embedding",
    }
    assert "desktop-proxy-token" not in status_response.text
    assert "legacy" not in status_response.text
    capability = runtime_model_capability("cloud/video-standard")
    assert capability is not None
    assert capability.video_workflow == "advanced-reference"
    assert capability.video_generation_min_seconds == 4
    assert capability.video_generation_max_seconds == 15
    assert capability.max_reference_images == 5
    assert capability.max_reference_videos == 1
    assert capability.max_reference_audios == 0
    assert capability.max_reference_total == 6
    assert capability.reference_audio_min_seconds == 1.8
    assert capability.reference_audio_total_max_seconds == 15.2
    assert capability.reference_video_min_seconds == 3
    assert capability.reference_video_total_max_seconds == 20


def test_internal_capability_endpoint_rejects_provider_secrets(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    _isolate_runtime(monkeypatch, tmp_path)
    app = FastAPI()
    app.include_router(model_gateway.router)
    client = TestClient(app)

    response = client.post(
        "/model-gateway/internal/capability",
        json={
            "allowsCustomModels": True,
            "mode": MODE_MIXED,
            "byokBaseUrl": "https://provider.example/v1",
            "byokApiKey": "must-not-cross-process-boundary",
        },
        headers={"X-AI-Anime-Model-Admin-Token": "desktop-admin-token"},
    )

    assert response.status_code == 422
    assert "must-not-cross-process-boundary" not in json.dumps(
        build_model_gateway_status()
    )
    assert not hasattr(runtime_model_access(), "byok_api_key")


def test_model_gateway_status_never_exposes_proxy_credentials(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    _isolate_runtime(monkeypatch, tmp_path)

    status = build_model_gateway_status()

    assert status["mode"] == MODE_MIXED
    assert status["cloud"] == {"configured": True, "managed": True}
    assert status["effective"] == {
        "source": "mixed_router",
        "configured": True,
    }
    assert "desktop-proxy-token" not in json.dumps(status)


def test_embedding_configuration_uses_only_the_router_transport(
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
    assert effective.dimensions == "1024"


def test_each_role_resolves_only_from_the_router_snapshot() -> None:
    configure_model_access(
        allows_custom_models=True,
        mode=MODE_MIXED,
        model_assignments=_assignments(),
    )

    assert resolve_model_for_role("TEXT") == "cloud-text"
    assert resolve_model_for_role("EMBEDDING") == "cloud-embedding"
    with pytest.raises(PermissionError, match="no model is assigned"):
        resolve_model_for_role("IMAGE_GENERATION")


def test_model_runtime_limits_are_available_to_the_local_backend() -> None:
    configure_model_access(
        allows_custom_models=True,
        mode=MODE_MIXED,
        model_assignments=[
            {
                "modelId": "Qwen3.8-27B",
                "role": "TEXT",
                "priority": 1,
                "contextWindow": 65536,
                "maxOutputTokens": 8192,
                "reasoningEfforts": ["medium", "xhigh"],
                "defaultReasoningEffort": "xhigh",
            }
        ],
    )

    assignment = resolve_model_assignment_for_role("TEXT")

    assert assignment.context_window == 65536
    assert assignment.max_output_tokens == 8192
    assert assignment.reasoning_efforts == ("medium", "xhigh")
    assert assignment.default_reasoning_effort == "xhigh"


def test_text_model_factory_uses_role_default_and_router_endpoint(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(
        "AI_ANIME_CLOUD_PROXY_BASE_URL",
        "http://127.0.0.1:45678/v1",
    )
    monkeypatch.setenv("AI_ANIME_CLOUD_PROXY_TOKEN", "desktop-proxy-token")
    configure_model_access(
        allows_custom_models=True,
        mode=MODE_MIXED,
        model_assignments=_assignments(),
    )
    captured: dict[str, object] = {}

    def fake_model(model_name: str, **kwargs):
        captured.update({"model": model_name, **kwargs})
        return object()

    monkeypatch.setattr(config, "_model_gateway_text_openai_model", fake_model)

    config.get_text_pydantic_model()
    assert captured["model"] == "cloud-text"
    assert captured["base_url"] == "http://127.0.0.1:45678/v1"
    assert captured["api_key"] == "desktop-proxy-token"
    assert captured["profile"] == {
        "openai_supports_tool_choice_required": False,
    }

    config.get_text_pydantic_model()
    assert captured["model"] == "cloud-text"


def test_synchronous_text_operation_owns_one_idempotency_key(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    _isolate_runtime(monkeypatch, tmp_path)
    client = config.get_model_access_openai_client(role="TEXT")
    try:
        idempotency_key = client.default_headers["Idempotency-Key"]
        role = client.default_headers["X-AI-Anime-Model-Role"]
    finally:
        client.close()

    assert str(uuid.UUID(idempotency_key)) == idempotency_key
    assert role == "TEXT"


def test_image_client_binds_the_current_project_task_to_proxy_requests(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    _isolate_runtime(monkeypatch, tmp_path)
    task_id = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
    with project_task_run_context(task_id):
        client = config.get_model_access_openai_client(role="IMAGE_GENERATION")
        _endpoint, json_headers = config.get_model_access_json_transport(
            role="IMAGE_GENERATION"
        )
    try:
        assert client.default_headers["X-AI-Anime-Task-ID"] == task_id
        assert json_headers["X-AI-Anime-Task-ID"] == task_id
        assert str(uuid.UUID(client.default_headers["Idempotency-Key"]))
    finally:
        client.close()


def test_startup_migration_purges_retired_local_gateway_secrets(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    _isolate_runtime(monkeypatch, tmp_path)
    monkeypatch.setattr(retired_gateway_settings, "STATE_DIR", str(tmp_path / "state"))
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
                ("official_model_gateway_api_key", "official-secret", "now"),
                ("custom_model_gateway_api_key", "custom-secret", "now"),
                ("media_relay_provider", "aliyun_oss", "now"),
            ],
        )

    retired_gateway_settings.purge_retired_gateway_settings()

    with sqlite3.connect(database) as connection:
        keys = {
            row[0]
            for row in connection.execute("SELECT key FROM runtime_settings").fetchall()
        }
    assert "model_gateway_mode" not in keys
    assert not any(key.startswith("official_model_gateway_") for key in keys)
    assert not any(key.startswith("custom_model_gateway_") for key in keys)
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


@pytest.mark.parametrize("allows_custom_models", [False, True])
def test_model_subprocess_receives_only_router_state_over_stdin(
    monkeypatch: pytest.MonkeyPatch,
    allows_custom_models: bool,
) -> None:
    base_url = "http://127.0.0.1:45678/v1"
    api_key = "desktop-proxy-token"
    monkeypatch.setenv("AI_ANIME_CLOUD_PROXY_BASE_URL", base_url)
    monkeypatch.setenv("AI_ANIME_CLOUD_PROXY_TOKEN", api_key)
    monkeypatch.setenv("FUTURE_PROVIDER_API_KEY", "direct-provider-secret")
    monkeypatch.setenv("FUTURE_PROVIDER_ACCESS_TOKEN", "direct-provider-token")
    monkeypatch.setenv("FUTURE_PROVIDER_BASE_URL", "https://provider.invalid/v1")
    configure_model_access(
        allows_custom_models=allows_custom_models,
        mode=MODE_MIXED,
        model_assignments=_assignments(),
        model_capabilities=[
            {
                "modelId": "cloud/video-standard",
                "imageRatioOptions": ["1:1", "16:9"],
                "imageSizeOptions": ["1328x1328", "1664x928"],
                "videoWorkflow": "advanced-reference",
                "videoRatioOptions": ["16:9", "9:16"],
                "videoResolutionOptions": ["720p", "1080p"],
                "videoSizeOptions": ["1344x768", "768x1344"],
                "videoSupportsGenerateAudio": False,
                "videoSupportsHumanReview": True,
                "videoExtraParameterNames": ["steps", "seed", "turbo"],
                "videoSceneOptimizeOptions": ["cinematic", "realistic"],
                "videoDurationOptions": [3, 5, 8],
                "videoGenerationMinSeconds": 4,
                "maxReferenceImages": 5,
                "referenceVideoMaxSeconds": 10,
            }
        ],
    )
    script = "\n".join(
        [
            "import hashlib, json, os",
            "from ai_anime.modules.model_usage.public import is_byok_allowed, load_model_access_from_stdin, runtime_model_access, runtime_model_capability",
            "loaded = load_model_access_from_stdin()",
            "access = runtime_model_access()",
            "capability = runtime_model_capability('cloud/video-standard')",
            "direct = ['AI_ANIME_CLOUD_PROXY_TOKEN', 'FUTURE_PROVIDER_API_KEY', 'FUTURE_PROVIDER_ACCESS_TOKEN', 'FUTURE_PROVIDER_BASE_URL']",
            "print(json.dumps({'loaded': loaded, 'allowsCustomModels': is_byok_allowed(), 'mode': access.mode, 'baseUrl': access.base_url, "
            "'apiKeyHash': hashlib.sha256(access.api_key.encode()).hexdigest(), "
            "'modelAssignments': [[item.model_id, item.role] for item in access.model_assignments], "
            "'imageRatioOptions': list(capability.image_ratio_options) if capability else None, "
            "'imageSizeOptions': list(capability.image_size_options) if capability else None, "
            "'videoWorkflow': capability.video_workflow if capability else None, "
            "'videoRatioOptions': list(capability.video_ratio_options) if capability else None, "
            "'videoResolutionOptions': list(capability.video_resolution_options) if capability else None, "
            "'videoSizeOptions': list(capability.video_size_options) if capability else None, "
            "'videoSupportsGenerateAudio': capability.video_supports_generate_audio if capability else None, "
            "'videoSupportsHumanReview': capability.video_supports_human_review if capability else None, "
            "'videoExtraParameterNames': list(capability.video_extra_parameter_names) if capability else None, "
            "'videoSceneOptimizeOptions': list(capability.video_scene_optimize_options) if capability else None, "
            "'videoDurationOptions': list(capability.video_duration_options) if capability else None, "
            "'videoGenerationMinSeconds': capability.video_generation_min_seconds if capability else None, "
            "'maxReferenceImages': capability.max_reference_images if capability else None, "
            "'referenceVideoMaxSeconds': capability.reference_video_max_seconds if capability else None, "
            "'directProviderEnvironmentPresent': any(os.environ.get(name) for name in direct), "
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
        "allowsCustomModels": allows_custom_models,
        "mode": MODE_MIXED,
        "baseUrl": base_url,
        "apiKeyHash": hashlib.sha256(api_key.encode()).hexdigest(),
        "modelAssignments": [
            ["cloud-embedding", "EMBEDDING"],
            ["cloud-text", "TEXT"],
            ["byok-text", "TEXT"],
        ],
        "imageRatioOptions": ["1:1", "16:9"],
        "imageSizeOptions": ["1328x1328", "1664x928"],
        "videoWorkflow": "advanced-reference",
        "videoRatioOptions": ["16:9", "9:16"],
        "videoResolutionOptions": ["720p", "1080p"],
        "videoSizeOptions": ["1344x768", "768x1344"],
        "videoSupportsGenerateAudio": False,
        "videoSupportsHumanReview": True,
        "videoExtraParameterNames": ["steps", "seed", "turbo"],
        "videoSceneOptimizeOptions": ["cinematic", "realistic"],
        "videoDurationOptions": [3.0, 5.0, 8.0],
        "videoGenerationMinSeconds": 4.0,
        "maxReferenceImages": 5,
        "referenceVideoMaxSeconds": 10.0,
        "directProviderEnvironmentPresent": False,
        "stdinMarkerPresent": False,
    }
    assert api_key not in " ".join(completed.args)
