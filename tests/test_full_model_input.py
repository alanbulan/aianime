from __future__ import annotations

from types import SimpleNamespace

import pytest


@pytest.mark.asyncio
async def test_event_extractor_sends_the_complete_chapter_to_the_model(monkeypatch):
    import pydantic_ai

    import ai_anime.modules.model_usage.public as model_usage
    from ai_anime.modules.knowledge_graph.infrastructure.event_extractor import (
        EventExtractor,
        ExtractedEventList,
    )

    prompts: list[str] = []

    class Agent:
        def __init__(self, *_args, **_kwargs) -> None:
            pass

        async def run(self, prompt: str):
            prompts.append(prompt)
            return SimpleNamespace(output=ExtractedEventList())

    monkeypatch.setattr(pydantic_ai, "Agent", Agent)
    monkeypatch.setattr(model_usage, "get_text_pydantic_model", lambda: "text-model")
    marker = "章节末尾不可丢失"
    chapter = "前文" * 6_100 + marker

    await EventExtractor().extract_events(1, chapter)

    assert marker in prompts[0]
    assert chapter in prompts[0]


@pytest.mark.asyncio
async def test_episode_metadata_sends_the_complete_chapter_to_the_model(monkeypatch):
    import litellm

    from ai_anime.modules.knowledge_graph.infrastructure.store import CogneeStore

    prompts: list[str] = []

    async def fake_acompletion(**kwargs):
        prompts.append(kwargs["messages"][0]["content"])
        return SimpleNamespace(
            choices=[
                SimpleNamespace(
                    message=SimpleNamespace(
                        content='{"title":"标题","summary":"摘要"}'
                    )
                )
            ]
        )

    monkeypatch.setattr(litellm, "acompletion", fake_acompletion)
    monkeypatch.setattr(
        CogneeStore,
        "_configured_text_transport_model",
        lambda _self: "text-model",
    )
    marker = "元数据原文末尾"
    chapter = "正文" * 4_100 + marker
    store = CogneeStore.__new__(CogneeStore)

    await store._generate_episode_metadata(1, chapter)

    assert marker in prompts[0]
    assert chapter in prompts[0]


@pytest.mark.asyncio
async def test_full_content_tool_returns_the_complete_episode():
    from ai_anime.modules.knowledge_graph.infrastructure.tools import (
        create_script_writer_tools,
    )

    marker = "工具原文末尾"
    content = "原文" * 4_100 + marker

    class Store:
        async def load_episode_content(self, _episode_num: int) -> str:
            return content

    tools = create_script_writer_tools(Store(), episode_num=1)  # type: ignore[arg-type]
    get_full_content = next(
        tool for tool in tools if tool.__name__ == "tool_get_episode_full_content"
    )

    result = await get_full_content()

    assert marker in result
    assert content in result
    assert "已截取" not in result
