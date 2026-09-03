from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest


class FakeAgent:
    def __init__(self, model, **kwargs):
        self.model = model
        self.kwargs = kwargs


def test_global_video_reviewer_uses_the_canonical_text_model_factory(monkeypatch):
    from ai_anime.modules.model_usage import public as config
    from ai_anime.modules.production.infrastructure import global_video_optimizer

    calls: list[None] = []
    sentinel = object()

    def fake_get_text_pydantic_model():
        calls.append(None)
        return sentinel

    monkeypatch.setattr(
        config,
        "get_text_pydantic_model",
        fake_get_text_pydantic_model,
    )
    monkeypatch.setattr(global_video_optimizer, "Agent", FakeAgent)

    agent = global_video_optimizer.create_global_video_reviewer_agent()

    assert calls == [None]
    assert agent.model is sentinel
    assert "Write the motion prompt in English." in agent.kwargs["system_prompt"]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("language", "expected_instruction", "expected_dialogue_label"),
    [
        ("en", "Generate the motion prompt in English", "Dialogue: 测试对白"),
        ("zh", "Generate the motion prompt in Chinese (中文)", "对白：测试对白"),
    ],
)
async def test_global_video_optimizer_applies_the_requested_language_to_the_task(
    monkeypatch,
    tmp_path: Path,
    language: str,
    expected_instruction: str,
    expected_dialogue_label: str,
) -> None:
    from ai_anime.modules.production.infrastructure import global_video_optimizer

    tasks: list[str] = []

    class CapturingAgent:
        async def run(self, user_prompt):
            tasks.append(user_prompt[0])
            return SimpleNamespace(output="camera moves forward")

    optimizer = global_video_optimizer.GlobalVideoPromptOptimizer()
    optimizer._agents[language] = CapturingAgent()
    monkeypatch.setattr(optimizer, "_compress_image", lambda _path: b"image")
    sketch = tmp_path / "beat.png"
    sketch.write_bytes(b"image")

    result = await optimizer.optimize_single_beat(
        beat={
            "beat_number": 1,
            "visual_description": "人物向前走",
            "narration_segment": "测试对白",
            "audio_type": "dialogue",
        },
        sketch_image_path=str(sketch),
        character_color_map={},
        language=language,
    )

    assert expected_instruction in tasks[0]
    assert expected_dialogue_label in result["prompt"]


def test_keyframe_prompt_builder_uses_the_canonical_text_model_factory(monkeypatch):
    from ai_anime.modules.model_usage import public as config
    from ai_anime.modules.narrative_planning.infrastructure import keyframe_prompt_builder

    calls: list[None] = []
    sentinel = object()

    def fake_get_text_pydantic_model():
        calls.append(None)
        return sentinel

    monkeypatch.setattr(
        config,
        "get_text_pydantic_model",
        fake_get_text_pydantic_model,
    )
    monkeypatch.setattr(keyframe_prompt_builder, "Agent", FakeAgent)

    agent = keyframe_prompt_builder.create_keyframe_prompt_builder_agent()

    assert calls == [None]
    assert agent.model is sentinel
