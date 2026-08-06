from __future__ import annotations

import pytest

from ai_anime.model_access_policy import configure_model_access
from ai_anime.modules.verification import sketch_visual_gate


@pytest.fixture(autouse=True)
def _reset_model_access() -> None:
    configure_model_access(allows_custom_models=False, mode="cloud")
    yield
    configure_model_access(allows_custom_models=False, mode="cloud")


@pytest.mark.asyncio
async def test_visual_gate_uses_shared_model_transport_without_provider_credentials(
    monkeypatch,
):
    captured = {}

    async def fake_request_model_chat_content(**kwargs):
        captured.update(kwargs)
        return '{"bad_pose": "no"}'

    monkeypatch.setattr(
        sketch_visual_gate,
        "request_model_chat_content",
        fake_request_model_chat_content,
    )

    result = await sketch_visual_gate._ask_vlm_once(
        image_bytes=b"image",
        prompt="review",
        model="cloud-vision-sku",
    )

    assert result == '{"bad_pose": "no"}'
    assert captured["model"] == "cloud-vision-sku"
    assert captured["max_tokens"] == 512
    assert captured["timeout_seconds"] == 60.0
    assert "provider" not in captured
    assert "api_key" not in captured
    assert "base_url" not in captured


@pytest.mark.asyncio
async def test_visual_gate_replaces_the_cloud_task_sku_in_byok_mode(monkeypatch):
    captured = {}
    configure_model_access(
        allows_custom_models=True,
        mode="byok",
        byok_base_url="https://models.example.test/v1",
        model_assignments=[{"modelId": "user-vision-model", "role": "TEXT"}],
    )
    async def fake_request_model_chat_content(**kwargs):
        captured.update(kwargs)
        return "ok"

    monkeypatch.setattr(
        sketch_visual_gate,
        "request_model_chat_content",
        fake_request_model_chat_content,
    )

    await sketch_visual_gate._ask_vlm_once(
        image_bytes=b"image",
        prompt="review",
        model="cloud-vision-task-sku",
    )

    assert captured["model"] == "user-vision-model"
