from __future__ import annotations

import importlib

import pytest


class FakeAgent:
    def __init__(self, model, **kwargs):
        self.model = model
        self.kwargs = kwargs


def _capture_model_calls(monkeypatch):
    from ai_anime import config

    calls: list[str | None] = []

    def fake_get_pydantic_model(model_name_override: str | None = None):
        calls.append(model_name_override)
        return object()

    monkeypatch.setattr(config, "get_pydantic_model", fake_get_pydantic_model)
    return calls


@pytest.mark.parametrize(
    ("module_name", "factory_name", "model_env"),
    [
        (
            "ai_anime.modules.agents.global_video_optimizer",
            "create_global_video_reviewer_agent",
            "GLOBAL_VIDEO_MODEL",
        ),
        (
            "ai_anime.modules.agents.video_prompt_builder",
            "create_video_prompt_builder_agent",
            "VIDEO_PROMPT_MODEL",
        ),
    ],
)
def test_superpower_prompt_agents_use_default_model_unless_overridden(
    monkeypatch,
    module_name,
    factory_name,
    model_env,
):
    calls = _capture_model_calls(monkeypatch)
    module = importlib.import_module(module_name)
    monkeypatch.setattr(module, "Agent", FakeAgent)
    for env_name in (
        model_env,
        "SUPERPOWER_MODEL",
        "SUPERPOWER_MODEL_NAME",
    ):
        monkeypatch.delenv(env_name, raising=False)

    getattr(module, factory_name)()

    assert calls == [None]


def test_global_video_reviewer_superpower_can_use_feature_specific_model_override(monkeypatch):
    calls = _capture_model_calls(monkeypatch)
    from ai_anime.modules.agents import global_video_optimizer

    monkeypatch.setattr(global_video_optimizer, "Agent", FakeAgent)
    monkeypatch.setenv("GLOBAL_VIDEO_MODEL", "gemini-3.5-flash")

    global_video_optimizer.create_global_video_reviewer_agent()

    assert calls == ["gemini-3.5-flash"]


def test_keyframe_prompt_builder_uses_video_optimizer_model(monkeypatch):
    from ai_anime import config
    from ai_anime.modules.agents import keyframe_prompt_builder

    calls: list[tuple[str, str]] = []

    def fake_get_newapi_text_pydantic_model(model_env: str, default_model: str):
        calls.append((model_env, default_model))
        return object()

    monkeypatch.setattr(
        config,
        "get_newapi_text_pydantic_model",
        fake_get_newapi_text_pydantic_model,
    )
    monkeypatch.setattr(keyframe_prompt_builder, "Agent", FakeAgent)

    keyframe_prompt_builder.create_keyframe_prompt_builder_agent()

    assert calls == [
        ("KEYFRAME_PROMPT_MODEL", "ai-anime-video-prompt-optimizer-LLM")
    ]
