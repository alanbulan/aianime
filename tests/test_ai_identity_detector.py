from __future__ import annotations

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
    captured: dict[str, str] = {}

    class FakeAgent:
        async def run(self, items):
            captured["task"] = items[0]
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
    assert "JSON object" in captured["task"]
    assert '"detections"' in captured["task"]


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
