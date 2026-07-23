from __future__ import annotations

import pytest

from ai_anime.modules.narrative_planning.domain import (
    RawEpisodeContentMissing,
    normalize_episode_rewrite,
)
from ai_anime.modules.narrative_planning.public import (
    GenerateEpisodeRewriteCommand,
    generate_episode_rewrite,
)


def test_normalizes_generated_episode_rewrite() -> None:
    result = normalize_episode_rewrite(
        "原文",
        "  改写第一行\n\n改写第二行  ",
    )

    assert result.content == "改写第一行\n\n改写第二行"
    assert result.line_count == 2
    assert result.used_fallback is False


def test_uses_fallback_when_rewriter_returns_source_unchanged() -> None:
    result = normalize_episode_rewrite(" 原文 ", "原文")

    assert result.content == ""
    assert result.line_count == 0
    assert result.used_fallback is True


@pytest.mark.asyncio
async def test_rejects_rewrite_without_raw_content() -> None:
    class _Store:
        async def load_episode_content(self, episode_num: int) -> str:
            return ""

    with pytest.raises(RawEpisodeContentMissing):
        await generate_episode_rewrite(
            _Store(),
            GenerateEpisodeRewriteCommand(
                episode_num=2,
                target_beats=12,
                beat_chars_min=80,
                beat_chars_max=160,
                narration_style="first_person",
            ),
        )
