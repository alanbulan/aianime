from __future__ import annotations

import json
import os
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from ai_anime.api.routes.model_usage import gateway
from ai_anime.modules.model_usage.public import configure_model_access, runtime_model_capability


def test_electron_billing_metadata_is_not_python_execution_authority(monkeypatch):
    fixture = json.loads((Path(__file__).parent / "fixtures/sidecar-capability-contract.json").read_text())
    monkeypatch.setenv("AI_ANIME_MODEL_ADMIN_TOKEN", "local-contract-test")
    app = FastAPI()
    app.include_router(gateway.router, prefix="/api/v1")
    client = TestClient(app)
    headers = {"X-AI-Anime-Model-Admin-Token": "local-contract-test"}
    body = {"allowsCustomModels": False, "mode": "mixed", "modelCapabilities": fixture["main"]}
    try:
        broken = client.post("/api/v1/model-gateway/internal/capability", json=body, headers=headers)
        assert broken.status_code == 422
        assert any(item["loc"][-1] == "billingVersion" for item in broken.json()["detail"])
        body["modelCapabilities"] = fixture["sidecar"]
        valid = client.post("/api/v1/model-gateway/internal/capability", json=body, headers=headers)
        assert valid.status_code == 200, valid.text
        assert runtime_model_capability("cloud-video").video_generation_max_seconds == 15
        body["modelCapabilities"][0]["unexpectedAuthority"] = True
        assert client.post("/api/v1/model-gateway/internal/capability", json=body, headers=headers).status_code == 422
        assert client.post("/api/v1/model-gateway/internal/capability", json={"mode": "mixed", "allowsCustomModels": False}).status_code == 403
    finally:
        configure_model_access(allows_custom_models=False, mode="mixed")


@pytest.mark.skipif(not os.environ.get("AI_ANIME_SIDECAR_CONTRACT_FILE"), reason="explicit public-catalog evidence is required")
def test_actual_cloud_capabilities_reach_the_local_runtime(monkeypatch):
    body = json.loads(Path(os.environ["AI_ANIME_SIDECAR_CONTRACT_FILE"]).read_text())
    monkeypatch.setenv("AI_ANIME_MODEL_ADMIN_TOKEN", "local-contract-test")
    app = FastAPI()
    app.include_router(gateway.router, prefix="/api/v1")
    try:
        response = TestClient(app).post("/api/v1/model-gateway/internal/capability", json=body, headers={"X-AI-Anime-Model-Admin-Token": "local-contract-test"})
        assert response.status_code == 200, response.text
        assert len(body["modelCapabilities"]) > 0
        for capability in body["modelCapabilities"]:
            assert runtime_model_capability(capability["modelId"]) is not None
    finally:
        configure_model_access(allows_custom_models=False, mode="mixed")
