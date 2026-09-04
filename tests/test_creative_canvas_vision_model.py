from __future__ import annotations

import base64
import io

import pytest
from PIL import Image
from pydantic_ai.models.test import TestModel

from ai_anime.modules.model_usage import public as config
from ai_anime.modules.model_usage.public import configure_model_access
from ai_anime.modules.creative_canvas.application.vision_analysis import (
    CreativeCanvasVisionInput,
    creative_canvas_image_media_type,
)
from ai_anime.modules.creative_canvas.infrastructure.vision_model import (
    CREATIVE_CANVAS_VISION_MAX_RAW_IMAGE_BYTES,
    call_creative_canvas_vision_model,
    compact_creative_canvas_vision_inputs,
)


@pytest.fixture(autouse=True)
def _reset_model_access() -> None:
    configure_model_access(
        allows_custom_models=False,
        mode="mixed",
        model_assignments=[
            {"modelId": "explicit-cloud-model", "role": "TEXT"},
        ],
    )
    yield
    configure_model_access(allows_custom_models=False, mode="mixed")


@pytest.mark.asyncio
async def test_vision_model_uses_cloud_catalog_assignment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, object] = {}

    def fake_get_model(**kwargs):
        captured.update(kwargs)
        return TestModel(custom_output_text="视觉解析结果")

    monkeypatch.setattr(config, "get_text_pydantic_model", fake_get_model)
    monkeypatch.setenv("FREEZONE_VISION_MODEL", "legacy-vision-model")
    configure_model_access(
        allows_custom_models=False,
        mode="mixed",
        model_assignments=[
            {"modelId": "cloud-text-default", "role": "TEXT"},
        ],
    )

    model, output = await call_creative_canvas_vision_model(
        prompt="分析图片",
        images=[CreativeCanvasVisionInput(data=b"image", media_type="image/png")],
    )

    assert model == "cloud-text-default"
    assert output == "视觉解析结果"
    assert captured["timeout_seconds_override"] == 120.0


@pytest.mark.asyncio
async def test_vision_model_ignores_task_environment_and_uses_router_assignment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, object] = {}

    def fake_get_model(**kwargs):
        captured.update(kwargs)
        return TestModel(custom_output_text="视觉解析结果")

    monkeypatch.setattr(config, "get_text_pydantic_model", fake_get_model)
    configure_model_access(
        allows_custom_models=True,
        mode="mixed",
        model_assignments=[
            {"modelId": "user-vision-model", "role": "TEXT"},
        ],
    )

    model, _output = await call_creative_canvas_vision_model(
        prompt="分析图片",
        images=[CreativeCanvasVisionInput(data=b"image")],
    )

    assert model == "user-vision-model"
    assert captured == {"timeout_seconds_override": 120.0}


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


@pytest.mark.asyncio
async def test_vision_inputs_are_compacted_below_json_relay_budget() -> None:
    images: list[CreativeCanvasVisionInput] = []
    for offset in (0, 40):
        source = Image.effect_noise((960, 540), 100).convert("RGB")
        source = source.point(lambda value: min(255, value + offset))
        with io.BytesIO() as buffer:
            source.save(buffer, format="PNG")
            images.append(
                CreativeCanvasVisionInput(
                    data=buffer.getvalue(),
                    media_type="image/png",
                )
            )
        source.close()

    compacted = await compact_creative_canvas_vision_inputs(
        tuple(images),
        max_total_bytes=80_000,
    )

    assert len(compacted) == 2
    assert sum(len(image.data) for image in compacted) <= 80_000
    assert all(image.media_type == "image/jpeg" for image in compacted)
    assert all(image.data.startswith(b"\xff\xd8") for image in compacted)

    encoded_bytes = sum(
        len(base64.b64encode(image.data)) for image in compacted
    )
    assert encoded_bytes < 4 * 1024 * 1024


@pytest.mark.asyncio
async def test_vision_inputs_below_budget_are_not_reencoded() -> None:
    images = (CreativeCanvasVisionInput(data=b"small-image"),)

    compacted = await compact_creative_canvas_vision_inputs(images)

    assert compacted is images
    assert CREATIVE_CANVAS_VISION_MAX_RAW_IMAGE_BYTES < 4 * 1024 * 1024
