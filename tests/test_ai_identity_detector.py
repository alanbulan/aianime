from __future__ import annotations

import io
from types import SimpleNamespace

import pytest
from PIL import Image
from pydantic_ai import Agent
from pydantic_ai.models.test import TestModel
from pydantic_ai.output import NativeOutput
from pydantic_ai.profiles import ModelProfile


@pytest.mark.asyncio
async def test_identity_detector_task_matches_structured_object_output(monkeypatch, tmp_path):
    from ai_anime.modules.production.infrastructure import global_video_optimizer
    from ai_anime.modules.production.infrastructure.global_video_optimizer import (
        BeatIdentity,
        BeatIdentityBatch,
    )

    image_path = tmp_path / "grid.png"
    Image.new("RGB", (8, 8), color=(255, 0, 0)).save(image_path)
    captured_task = ""
    captured_image_size: tuple[int, int] | None = None

    class FakeAgent:
        async def run(self, items):
            nonlocal captured_image_size, captured_task
            captured_task = items[0]
            with Image.open(io.BytesIO(items[1].data)) as image:
                captured_image_size = image.size
            return SimpleNamespace(
                output=BeatIdentityBatch(
                    detections=[
                        BeatIdentity(beat_number=1, identities=["Hero_Main"])
                    ]
                )
            )

    monkeypatch.setattr(
        global_video_optimizer,
        "_create_identity_detector_agent",
        lambda: FakeAgent(),
    )

    result = await global_video_optimizer.detect_identities_by_ai(
        sketch_image_paths=[str(image_path)],
        color_identity_map={"#ff0000 RED": "Hero_Main"},
        total_beats=1,
    )

    assert result == {1: ["Hero_Main"]}
    assert "JSON object" in captured_task
    assert '"detections"' in captured_task
    assert captured_image_size == (8, 8)


@pytest.mark.asyncio
async def test_identity_detector_scales_oversized_grid_before_upload(
    monkeypatch,
    tmp_path,
):
    from ai_anime.modules.production.infrastructure import global_video_optimizer
    from ai_anime.modules.production.infrastructure.global_video_optimizer import (
        BeatIdentity,
        BeatIdentityBatch,
        VISION_INPUT_MAX_EDGE,
    )

    image_path = tmp_path / "oversized-grid.png"
    original_size = (1565, 2315)
    Image.new("RGB", original_size, color=(255, 0, 0)).save(image_path)
    captured_image_size: tuple[int, int] | None = None

    class FakeAgent:
        async def run(self, items):
            nonlocal captured_image_size
            with Image.open(io.BytesIO(items[1].data)) as image:
                captured_image_size = image.size
            return SimpleNamespace(
                output=BeatIdentityBatch(
                    detections=[BeatIdentity(beat_number=1, identities=[])]
                )
            )

    monkeypatch.setattr(
        global_video_optimizer,
        "_create_identity_detector_agent",
        lambda: FakeAgent(),
    )

    result = await global_video_optimizer.detect_identities_by_ai(
        sketch_image_paths=[str(image_path)],
        color_identity_map={"#ff0000 RED": "Hero_Main"},
        total_beats=25,
    )

    assert result == {1: []}
    assert captured_image_size is not None
    uploaded_width, uploaded_height = captured_image_size
    assert max(uploaded_width, uploaded_height) == VISION_INPUT_MAX_EDGE
    assert uploaded_width < original_size[0]
    assert uploaded_width / uploaded_height == pytest.approx(
        original_size[0] / original_size[1],
        abs=0.001,
    )
    with Image.open(image_path) as original:
        assert original.size == original_size


@pytest.mark.asyncio
async def test_identity_detector_native_output_accepts_explicit_object_contract():
    from ai_anime.modules.production.infrastructure.global_video_optimizer import (
        BeatIdentityBatch,
    )

    model = TestModel(
        custom_output_text=(
            '{"detections":['
            '{"beat_number":1,"identities":["Hero_Main"]}'
            "]}"
        ),
        profile=ModelProfile(supports_json_schema_output=True),
    )
    agent = Agent(model, output_type=NativeOutput(BeatIdentityBatch))

    result = await agent.run("detect")

    assert result.output.model_dump() == {
        "detections": [
            {"beat_number": 1, "identities": ["Hero_Main"]},
        ]
    }
