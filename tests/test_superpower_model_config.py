from __future__ import annotations


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
