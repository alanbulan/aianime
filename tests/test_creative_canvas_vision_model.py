from __future__ import annotations

import pytest
from pydantic_ai.models.test import TestModel

from ai_anime import config
from ai_anime.model_access_policy import configure_model_access
from ai_anime.modules.creative_canvas.application.vision_analysis import (
    CreativeCanvasVisionInput,
    creative_canvas_image_media_type,
)
from ai_anime.modules.creative_canvas.infrastructure.vision_model import (
    call_creative_canvas_vision_model,
)


@pytest.fixture(autouse=True)
def _reset_model_access() -> None:
    configure_model_access(allows_custom_models=False, mode="cloud")
    yield
    configure_model_access(allows_custom_models=False, mode="cloud")


@pytest.mark.asyncio
async def test_vision_model_uses_cloud_catalog_assignment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, object] = {}

    def fake_get_model(model_env, default_model, **kwargs):
        captured.update(
            {
                "model_env": model_env,
                "default_model": default_model,
                **kwargs,
            }
        )
        return TestModel(custom_output_text="视觉解析结果")

    monkeypatch.setattr(config, "get_newapi_text_pydantic_model", fake_get_model)
    monkeypatch.setenv("FREEZONE_VISION_MODEL", "legacy-vision-model")
    configure_model_access(
        allows_custom_models=False,
        mode="cloud",
        cloud_model_assignments=[
            {"modelId": "cloud-text-default", "role": "TEXT"},
        ],
    )

    model, output = await call_creative_canvas_vision_model(
        prompt="分析图片",
        images=[CreativeCanvasVisionInput(data=b"image", media_type="image/png")],
    )

    assert model == "cloud-text-default"
    assert output == "视觉解析结果"
    assert captured["model_env"] == "FREEZONE_VISION_MODEL"
    assert captured["model_name_override"] == "cloud-text-default"


@pytest.mark.asyncio
async def test_vision_model_preserves_explicit_cloud_model(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, object] = {}

    def fake_get_model(_model_env, _default_model, **kwargs):
        captured.update(kwargs)
        return TestModel(custom_output_text="视觉解析结果")

    monkeypatch.setattr(config, "get_newapi_text_pydantic_model", fake_get_model)

    model, _output = await call_creative_canvas_vision_model(
        prompt="分析图片",
        images=[CreativeCanvasVisionInput(data=b"image")],
        model_override="explicit-cloud-model",
    )

    assert model == "explicit-cloud-model"
    assert captured["model_name_override"] == "explicit-cloud-model"


@pytest.mark.asyncio
async def test_vision_model_maps_platform_model_to_byok_text_assignment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, object] = {}

    def fake_get_model(_model_env, _default_model, **kwargs):
        captured.update(kwargs)
        return TestModel(custom_output_text="视觉解析结果")

    monkeypatch.setattr(config, "get_newapi_text_pydantic_model", fake_get_model)
    configure_model_access(
        allows_custom_models=True,
        mode="byok",
        byok_base_url="https://byok.example/v1",
        byok_api_key="secret",
        model_assignments=[
            {"modelId": "user-vision-model", "role": "TEXT"},
        ],
    )

    model, _output = await call_creative_canvas_vision_model(
        prompt="分析图片",
        images=[CreativeCanvasVisionInput(data=b"image")],
        model_override="platform-vision-model",
    )

    assert model == "user-vision-model"
    assert captured["model_name_override"] == "user-vision-model"


@pytest.mark.parametrize(
    ("path", "expected"),
    [
        ("frame.png", "image/png"),
        ("frame.jpg", "image/jpeg"),
        ("frame.JPEG", "image/jpeg"),
        ("frame.webp", "image/webp"),
        ("frame.gif", "image/gif"),
        ("frame", "image/png"),
    ],
)
def test_image_media_type(path: str, expected: str) -> None:
    assert creative_canvas_image_media_type(path) == expected
