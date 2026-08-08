from __future__ import annotations

import pytest

from ai_anime.modules.production.infrastructure.media_generation import image_generator
from ai_anime.modules.model_usage.public import InsufficientCreditsError

pytestmark = pytest.mark.m04


@pytest.mark.asyncio
async def test_commercial_image_adapter_forwards_platform_sku_and_saves_result(
    monkeypatch,
    tmp_path,
):
    calls: list[dict] = []

    async def fake_generate(**kwargs):
        calls.append(kwargs)
        return b"image", ""

    monkeypatch.setattr(image_generator, "_generate_commercial_image", fake_generate)
    generator = image_generator.CommercialImageGenerator("newapi_gpt_image2")
    output_path = tmp_path / "out.png"

    result = await generator.generate(
        prompt="test",
        output_path=str(output_path),
        width=720,
        height=1280,
    )

    assert result.success is True
    assert output_path.read_bytes() == b"image"
    assert calls == [
        {
            "model": "newapi_gpt_image2",
            "prompt": calls[0]["prompt"],
            "reference_images": None,
            "aspect_ratio": "720:1280",
        }
    ]
    assert "test" in calls[0]["prompt"]


@pytest.mark.asyncio
async def test_commercial_image_adapter_reports_missing_image(monkeypatch, tmp_path):
    async def fake_generate(**_kwargs):
        return None, "missing_image_data"

    monkeypatch.setattr(image_generator, "_generate_commercial_image", fake_generate)

    result = await image_generator.CommercialImageGenerator("image-platform-sku").generate(
        prompt="test",
        output_path=str(tmp_path / "out.png"),
    )

    assert result.success is False
    assert result.error == "missing_image_data"


@pytest.mark.asyncio
async def test_commercial_image_adapter_reraises_insufficient_credit(
    monkeypatch,
    tmp_path,
):
    async def fake_generate(**_kwargs):
        raise InsufficientCreditsError(user_id="usr_1", cost=5, balance=0)

    monkeypatch.setattr(image_generator, "_generate_commercial_image", fake_generate)

    with pytest.raises(InsufficientCreditsError):
        await image_generator.CommercialImageGenerator("image-platform-sku").generate(
            prompt="test",
            output_path=str(tmp_path / "out.png"),
        )
